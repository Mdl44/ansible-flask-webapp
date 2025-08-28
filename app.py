import os
import uuid
import subprocess
from datetime import datetime, timezone, timedelta

import yaml
from flask import Flask, jsonify, request, render_template, make_response
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

from sqlalchemy import create_engine, text

import pwd
import grp

APP_CONFIG = {
    'manifest_dir': '/mnt/nfsshare/app-manifests',
    'conda': {
        'base_path': '/mnt/nfsshare/miniforge3',
        'ignored_envs': ['miniforge3', 'base']
    }
}

app = Flask(__name__)


app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# =============================================================================
# DATABASE MODELS
# =============================================================================

class Role(db.Model):
    __tablename__ = 'roles'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(32), unique=True, nullable=False)
    description = db.Column(db.String(128))

user_applications = db.Table('user_applications',
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
    db.Column('application_id', db.Integer, db.ForeignKey('applications.id'), primary_key=True)
)


class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    email = db.Column(db.String(128), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    full_name = db.Column(db.String(128))
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'))
    created_at = db.Column(db.DateTime)
    last_login = db.Column(db.DateTime)
    applications = db.relationship('Application', secondary=user_applications, backref='users')


class Session(db.Model):
    __tablename__ = 'sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    session_token = db.Column(db.String(128), unique=True, nullable=False)
    created_at = db.Column(db.DateTime)
    expires_at = db.Column(db.DateTime)
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.String(256))

class Application(db.Model):
    __tablename__ = 'applications'
    id = db.Column(db.Integer, primary_key=True)
    app_id = db.Column(db.String(128), unique=True, nullable=False)
    name = db.Column(db.String(128), nullable=False)
    description = db.Column(db.String(256))

def sync_applications_table():
    manifests = load_application_manifests()
    from sqlalchemy.exc import IntegrityError

    manifest_app_ids = set()
    manifest_data = {}
    for app in manifests:
        app_id = app['type']
        manifest_app_ids.add(app_id)
        manifest_data[app_id] = {
            'name': app['name'],
            'description': app.get('description', '')
        }

    db_app_ids = set()
    apps_table = db.Model.metadata.tables['applications']
    db_apps = db.session.execute(db.select(apps_table)).fetchall()
    for row in db_apps:
        db_app_ids.add(row.app_id)

    for app_id in manifest_app_ids:
        name = manifest_data[app_id]['name']
        description = manifest_data[app_id]['description']
        existing = db.session.execute(
            db.select(apps_table).where(apps_table.c.app_id == app_id)
        ).first()
        if not existing:
            try:
                db.session.execute(
                    apps_table.insert().values(app_id=app_id, name=name, description=description)
                )
                db.session.commit()
                print(f"Inserted application: {app_id}")
            except IntegrityError:
                db.session.rollback()
        else:
            db.session.execute(
                apps_table.update()
                .where(apps_table.c.app_id == app_id)
                .values(name=name, description=description)
            )
            db.session.commit()

    for db_app_id in db_app_ids - manifest_app_ids:
        db.session.execute(
            apps_table.delete().where(apps_table.c.app_id == db_app_id)
        )
        db.session.commit()
        print(f"Deleted application: {db_app_id}")

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def hash_password(password):
    return generate_password_hash(password)


def verify_password(password, password_hash):
    return check_password_hash(password_hash, password)


def get_current_user():
    token = request.cookies.get('session_token')
    if not token:
        return None
    
    session = Session.query.filter_by(session_token=token).first()
    if not session:
        return None
    

    expires_at = session.expires_at
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        now = now.replace(tzinfo=None)
    
    if expires_at < now:
        return None
    
    user = db.session.get(User, session.user_id)
    return user

def get_conda_environments():
    conda_path = APP_CONFIG['conda']['base_path']
    ignored_envs = APP_CONFIG['conda']['ignored_envs']
    environments = []
    
    if not os.path.exists(conda_path):
        print(f"Warning: Conda base path {conda_path} not found")
        return environments
    
    conda_bin = os.path.join(conda_path, 'bin', 'conda')
    if not os.path.exists(conda_bin):
        print(f"Warning: Conda executable not found at {conda_bin}")
        return environments
    
    try:
        result = subprocess.run([conda_bin, 'env', 'list', '--json'], 
                              capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            import json
            env_data = json.loads(result.stdout)
            
            for env_path in env_data.get('envs', []):
                env_name = os.path.basename(env_path)
                if env_name not in ignored_envs:
                    environments.append(env_name)
            
            print(f"Found conda environments: {environments}")
        else:
            print(f"Error listing conda environments: {result.stderr}")
                    
    except Exception as e:
        print(f"Error getting conda environments: {str(e)}")
    
    return environments

def load_application_manifests():
    applications = []
    manifest_dir = APP_CONFIG['manifest_dir']
    
    if not os.path.exists(manifest_dir):
        print(f"Warning: Manifest directory {manifest_dir} not found")
        return applications
    
    for filename in os.listdir(manifest_dir):
        if filename.endswith(('.yaml', '.yml')):
            manifest_path = os.path.join(manifest_dir, filename)
            try:
                with open(manifest_path, 'r') as f:
                    manifest = yaml.safe_load(f)
                
                if not manifest or not isinstance(manifest, dict):
                    print(f"Warning: Invalid manifest in {filename}, skipping")
                    continue
                
                manifest['_filename'] = filename
                manifest['_path'] = manifest_path
                
                test_files = get_test_files_for_manifest(manifest)
                
                app_entry = {
                    'name': manifest.get('name', os.path.splitext(filename)[0]),
                    'type': manifest.get('id', os.path.splitext(filename)[0]),
                    'description': manifest.get('description', f"Run {manifest.get('name', filename)}"),
                    'manifest': manifest,
                    'test_files': test_files
                }
                
                if manifest.get('type') == 'binary':
                    app_entry['executable'] = manifest.get('executable')
                elif manifest.get('type') == 'conda':
                    app_entry['environment'] = manifest.get('environment')
                
                applications.append(app_entry)
                print(f"Loaded application manifest: {app_entry['name']}")
                
            except Exception as e:
                print(f"Error loading manifest {filename}: {str(e)}")
    
    return applications

def get_test_files_for_manifest(manifest):
    test_files = []
    
    workdir = manifest.get('workdir')
    if not workdir or not os.path.exists(workdir):
        print(f"Warning: Workdir {workdir} not found for manifest {manifest.get('name')}")
        return test_files
    
    input_spec = manifest.get('input', {})
    
    extensions = []
    if 'extensions' in input_spec:
        if isinstance(input_spec['extensions'], list):
            extensions = input_spec['extensions']
        else:
            extensions = [input_spec['extensions']]
    elif 'ext' in input_spec:
        extensions = [input_spec['ext']]
    
    try:
        for root, _, files in os.walk(workdir):
            for file in files:
                file_ext = os.path.splitext(file)[1].lower()
                if not extensions or file_ext in extensions:
                    rel_path = os.path.relpath(root, workdir)
                    test_files.append({
                        'name': file,
                        'path': os.path.join(root, file),
                        'directory': root,
                        'relative_dir': rel_path if rel_path != '.' else '',
                        'display_name': f"{rel_path}/{file}" if rel_path != '.' else file
                    })
    except Exception as e:
        print(f"Error finding test files for {manifest.get('name')}: {str(e)}")
    
    return test_files

@app.route('/api/applications')
def list_applications():
    user = get_current_user()
    if not user:
        return jsonify([])

    role = db.session.get(Role, user.role_id).name if user.role_id else 'user' 
    
    if role == 'admin':
        applications = load_application_manifests()
        return jsonify(applications)
    
    user_app_ids = [app.app_id for app in user.applications] if user.applications else []
    
    if not user_app_ids:
        return jsonify([])
    
    all_manifests = load_application_manifests()
    filtered_apps = [app for app in all_manifests if app['type'] in user_app_ids]
    
    return jsonify(filtered_apps)

def inject_application_setup(content, app_config):
    if not app_config:
        return content
    
    manifest = app_config.get('manifest', {})
    app_name = app_config.get('name', 'Unknown')
    app_type = manifest.get('type', 'Unknown')
    
    norm_app_name = app_name.upper().replace(' ', '_').replace('-', '_').replace('(', '').replace(')', '')
    
    app_signature = f"# Application: {app_name}\n# Type: {app_type}"
    if app_signature in content:
        print(f"Application setup for {app_name} already exists in script, skipping injection")
        return content
    
    lines = content.split('\n')
    headers = []
    content_body = []
    
    in_headers = True
    for line in lines:
        if in_headers and (line.startswith('#!') or line.startswith('#SBATCH')):
            headers.append(line)
        else:
            in_headers = False
            content_body.append(line)
    
    app_setup_lines = [
        "",
        "# === APPLICATION SETUP ===",
        "# Environment variables for all configured applications"
    ]
    
    app_setup_lines.extend([
        f"# Application: {app_name}",
        f"# Type: {app_type}"
    ])
    
    if app_type == 'conda':
        conda_path = APP_CONFIG['conda']['base_path']
        env_name = manifest.get('environment')
        if env_name:
            app_setup_lines.extend([
                f"export APP_{norm_app_name}_SELECTED=1",
                f"export CONDA_BASE=\"{conda_path}\"",
                f"export CONDA_ENV_{norm_app_name}=\"{env_name}\""
            ])
    elif app_type == 'binary':
        executable = manifest.get('executable')
        if executable:
            bin_path = os.path.dirname(executable)
            app_setup_lines.extend([
                f"export APP_{norm_app_name}_SELECTED=1",
                f"export {norm_app_name}_BIN=\"{executable}\"",
                f"export {norm_app_name}_PATH=\"{bin_path}\""
            ])
    
    app_setup_lines.append("# === END APPLICATION SETUP ===")
    
    helper_lines = [
        "",
        "# === APP EXECUTION HELPERS ===",
        "# Functions to run applications in their proper environments"
    ]
    
    func_name = f"run_{norm_app_name.lower()}"
    
    if app_type == 'conda':
        helper_lines.extend([
            f"function {func_name}() {{",
            f"  (source \"$CONDA_BASE/etc/profile.d/conda.sh\" && conda activate \"$CONDA_ENV_{norm_app_name}\" && \"$@\")",
            "}",
            ""
        ])
    elif app_type == 'binary':
        helper_lines.extend([
            f"function {func_name}() {{",
            f"  \"${norm_app_name}_BIN\" \"$@\"", 
            "}",
            ""
        ])
    
    helper_lines.append("# === END APP EXECUTION HELPERS ===")
    
    has_setup = False
    has_helpers = False
    setup_start_idx = -1
    setup_end_idx = -1
    helpers_start_idx = -1
    helpers_end_idx = -1
    
    for i, line in enumerate(content_body):
        if "# === APPLICATION SETUP ===" in line:
            has_setup = True
            setup_start_idx = i
        elif "# === END APPLICATION SETUP ===" in line:
            setup_end_idx = i
        elif "# === APP EXECUTION HELPERS ===" in line:
            has_helpers = True
            helpers_start_idx = i
        elif "# === END APP EXECUTION HELPERS ===" in line:
            helpers_end_idx = i
    
    result_lines = headers
    
    if has_setup and setup_start_idx >= 0 and setup_end_idx > setup_start_idx:
        setup_lines = content_body[setup_start_idx:setup_end_idx+1]
        merged_setup = setup_lines[:-1] + app_setup_lines[3:-1] + [setup_lines[-1]]
        result_lines.extend(merged_setup)
    else:
        result_lines.extend(app_setup_lines)
    
    if has_helpers and helpers_start_idx >= 0 and helpers_end_idx > helpers_start_idx:
        helper_lines_existing = content_body[helpers_start_idx:helpers_end_idx+1]
        merged_helpers = helper_lines_existing[:-1] + helper_lines[3:-1] + [helper_lines_existing[-1]]
        result_lines.extend(merged_helpers)
    else:
        result_lines.extend(helper_lines)
    
    if has_setup or has_helpers:
        for i, line in enumerate(content_body):
            if has_setup and setup_start_idx <= i <= setup_end_idx:
                continue
            if has_helpers and helpers_start_idx <= i <= helpers_end_idx:
                continue
            result_lines.append(line)
    else:
        result_lines.extend(content_body)
    
    return '\n'.join(result_lines)

    
def initialize_directories():
    home_dir = os.path.expanduser("~")
    directories = [
        os.path.join(home_dir, "ansible_quickstart"),
        os.path.join(home_dir, "ansible_quickstart", "playbooks"),
        os.path.join(home_dir, "ansible_quickstart", "jobs"),
        APP_CONFIG['manifest_dir']
    ]
    
    for directory in directories:
        if not os.path.exists(directory):
            try:
                os.makedirs(directory)
                print(f"Created directory: {directory}")
            except Exception as e:
                print(f"Error creating directory {directory}: {str(e)}")

# =============================================================================
# ANSIBLE INVENTORY MANAGEMENT
# =============================================================================

def parse_inventory_file():

    hosts = []
    groups = {}
    home_dir = os.path.expanduser("~")
    inventory_path = os.path.join(home_dir, "ansible_quickstart", "inventory.ini")
    
    if not os.path.exists(inventory_path):
        print(f"Inventory file not found at: {inventory_path}")
        return hosts

    try:
        with open(inventory_path, 'r') as file:
            content = file.read()
        
        lines = content.split('\n')
        current_group = None
        seen_hosts = {}

        for line in lines:
            line = line.strip()
            
            if line == "" or line.startswith('#'):
                continue

            if line.startswith('[') and line.endswith(']'):
                current_group = line[1:-1]
                if ':children' not in current_group:
                    groups[current_group] = []
                continue

            parts = line.split()
            if parts:
                name = parts[0]
                host_info = {'name': name, 'groups': []}
                
                for part in parts[1:]:
                    if part.startswith('ansible_host='):
                        host_info['ip'] = part.split('=', 1)[1]
                    elif part.startswith('ansible_user='):
                        host_info['user'] = part.split('=', 1)[1]
                    elif part.startswith('ansible_connection='):
                        host_info['connection'] = part.split('=', 1)[1]
                
                if 'ip' in host_info and name not in seen_hosts:
                    hosts.append(host_info)
                    seen_hosts[name] = len(hosts) - 1
                    print(f"Found host: {name} -> {host_info.get('ip', '')}")
                
                if current_group and current_group in groups:
                    groups[current_group].append(name)
                    if name in seen_hosts:
                        host_index = seen_hosts[name]
                        if current_group not in hosts[host_index]['groups']:
                            hosts[host_index]['groups'].append(current_group)
                continue
            
            parts = line.split('.')
            if len(parts) == 4 and all(part.isdigit() for part in parts):
                ip = line
                name = f"host-{ip.replace('.', '-')}"
                
                if name not in seen_hosts:
                    host_info = {
                        'name': name,
                        'ip': ip,
                        'groups': []
                    }
                    if current_group:
                        host_info['groups'].append(current_group)
                    hosts.append(host_info)
                    seen_hosts[name] = len(hosts) - 1
                    print(f"Found simple IP: {ip}")
                
                if current_group and current_group in groups:
                    groups[current_group].append(name)

        group_hosts = []
        for group_name, group_members in groups.items():
            if group_members and group_name != 'all':
                group_info = {
                    'name': f"group:{group_name}",
                    'ip': f"Group ({len(group_members)} hosts: {', '.join(group_members)})",
                    'groups': [group_name]
                }
                group_hosts.append(group_info)
        
        filtered_group_hosts = [
            group for group in group_hosts 
            if not group['name'].replace('group:', '').endswith(':children')
        ]
        filtered_group_hosts.sort(key=lambda x: x['name'])
        
        all_option = {
            'name': 'all',
            'ip': f'All hosts ({len(hosts)} hosts)',
            'groups': ['all']
        }
        
        final_hosts = [all_option] + filtered_group_hosts + hosts
        
        print(f"Final hosts count: {len(final_hosts)} (including {len(filtered_group_hosts)} filtered groups)")
        print(f"Groups found: {list(groups.keys())}")
        print(f"Filtered groups: {[g['name'] for g in filtered_group_hosts]}")
        
        return final_hosts
        
    except Exception as e:
        print(f"Error reading inventory file: {str(e)}")
        return hosts

# =============================================================================
# PLAYBOOK MANAGEMENT
# =============================================================================

def get_playbooks():
    playbooks = []
    unique_filenames = set()
    user = get_current_user()
    if not user:
        return []
    
    role = db.session.get(Role, user.role_id).name if user.role_id else 'user' 
    
    if role == 'admin':
        found = get_playbook_paths()
        for filename, path in found.items():
            if filename in unique_filenames:
                continue
                
            unique_filenames.add(filename)
            playbook_name = os.path.splitext(filename)[0]
            playbooks.append({
                'filename': filename,
                'name': playbook_name,
                'path': path
            })
    else:
        home_dir = os.path.expanduser("~")
        playbooks_path = os.path.join(home_dir, "ansible_quickstart", "playbooks")
        if os.path.exists(playbooks_path):
            for filename in os.listdir(playbooks_path):
                if filename.endswith(('.yml', '.yaml')):
                    if filename in unique_filenames:
                        continue
                        
                    unique_filenames.add(filename)
                    playbook_name = os.path.splitext(filename)[0]
                    playbooks.append({
                        'filename': filename,
                        'name': playbook_name,
                        'path': os.path.join(playbooks_path, filename)
                    })
    
    playbooks.sort(key=lambda p: p['name'])
    return playbooks

# =============================================================================
# SLURM JOB MANAGEMENT
# =============================================================================

def get_jobs():
    jobs = []
    unique_filenames = set()
    user = get_current_user()
    if not user:
        return jobs
    
    jobs_dir = f'/home/{user.username}/slurm_jobs'
    if os.path.exists(jobs_dir):
        for filename in os.listdir(jobs_dir):
            if filename.endswith(('.yml', '.yaml', '.sh', '.slurm')):
                if filename in unique_filenames:
                    continue
                    
                unique_filenames.add(filename)
                job_name = os.path.splitext(filename)[0]
                job_info = {
                    'filename': filename,
                    'name': job_name,
                    'path': os.path.join(jobs_dir, filename),
                    'owner': user.username
                }
                jobs.append(job_info)
    
    role = db.session.get(Role, user.role_id).name if user.role_id else 'user'
    if role == 'admin':
        admin_dirs = ['/root/slurm_jobs']
        for admin_dir in admin_dirs:
            if os.path.exists(admin_dir):
                for filename in os.listdir(admin_dir):
                    if filename.endswith(('.yml', '.yaml', '.sh', '.slurm')):
                        if filename in unique_filenames:
                            continue
                            
                        unique_filenames.add(filename)
                        job_name = os.path.splitext(filename)[0]
                        job_info = {
                            'filename': filename,
                            'name': job_name,
                            'path': os.path.join(admin_dir, filename),
                            'owner': 'root'
                        }
                        jobs.append(job_info)
    
    jobs.sort(key=lambda x: x['name'])
    return jobs

@app.route('/api/update-job', methods=['POST'])
def update_job():
    try:
        user = get_current_user()
        if not user:
            return jsonify({'success': False, 'error': 'Not logged in'})
        role = db.session.get(Role, user.role_id).name if user.role_id else 'user' 
        
        data = request.get_json()
        original_filename = data.get('original_filename')
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        content = data.get('content', '').strip()

        if not original_filename or not name or not content:
            return jsonify({'success': False, 'error': 'Original filename, name and content are required'})

        filename = name
        if not filename.endswith(('.sh', '.slurm')):
            filename += '.sh'

        original_path = None
        job_owner = user.username
        
        if role == 'admin':
            import glob
            for jobs_dir in glob.glob('/home/*/slurm_jobs'):
                candidate = os.path.join(jobs_dir, original_filename)
                if os.path.exists(candidate):
                    original_path = candidate
                    job_owner = jobs_dir.split('/')[2] 
                    break
        else:
            jobs_dir = f'/home/{user.username}/slurm_jobs'
            candidate = os.path.join(jobs_dir, original_filename)
            if os.path.exists(candidate):
                original_path = candidate

        if not original_path:
            return jsonify({'success': False, 'error': f'Original job {original_filename} not found'})

        jobs_dir = os.path.dirname(original_path)
        new_path = os.path.join(jobs_dir, filename)

        if filename != original_filename and os.path.exists(new_path):
            return jsonify({'success': False, 'error': f'Job {filename} already exists'})

        final_content = content
        if description:
            final_content = prepend_description_to_script(content, description)

        with open(new_path, 'w') as f:
            f.write(final_content)

        os.chmod(new_path, 0o755)
        
        if role == 'admin' and job_owner != user.username:
            try:
                user_info = pwd.getpwnam(job_owner)
                os.chown(new_path, user_info.pw_uid, user_info.pw_gid)
            except KeyError:
                pass

        if filename != original_filename:
            os.remove(original_path)

        return jsonify({
            'success': True,
            'filename': filename,
            'path': new_path,
            'message': f'Job {filename} updated successfully'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to update job: {str(e)}'})

# =============================================================================
# WEB ROUTES - MAIN PAGES
# =============================================================================

@app.route('/')
def index():
    default_playbook = """---
- name: Create file in /root on target host
  hosts: all
  become: true
  tasks:
    - name: Create /root/ansible_test.txt
      copy:
        content: "Created by Ansible on {{ ansible_date_time.iso8601 }}"
        dest: /root/ansible_test.txt
        owner: root
        group: root
        mode: '0644'
"""

    manifests = load_application_manifests()
    preview_lines = [
        "#!/bin/bash",
        "# Description: Example SLURM job with application setup preview",
        "",
        "# === APPLICATION SETUP PREVIEW ==="
    ]
    for app_entry in manifests:
        name = app_entry.get('name', 'Unknown')
        manifest = app_entry.get('manifest', {}) or {}
        mtype = manifest.get('type', 'Unknown')
        preview_lines.append(f"# Application: {name}")
        preview_lines.append(f"# Type: {mtype}")
        if mtype == 'conda':
            conda_path = APP_CONFIG['conda']['base_path']
            env_name = manifest.get('environment')
            if env_name:
                preview_lines.append(f"# export PATH=\"{conda_path}/bin:$PATH\"")
                preview_lines.append(f"# source {conda_path}/etc/profile.d/conda.sh")
                preview_lines.append(f"# conda activate {env_name}")
        elif mtype == 'binary':
            if manifest.get('path'):
                preview_lines.append(f"# export PATH=\"{manifest.get('path')}:$PATH\"")
        preview_lines.append("# ---")
    preview_lines.append("# === END APPLICATION SETUP PREVIEW ===")
    preview_lines.append("")
    preview_lines.append("# Your job content goes below this preview")
    default_job = "\n".join(preview_lines)

    return render_template('index.html',
                           default_playbook=default_playbook,
                           default_job=default_job)

# =============================================================================
# API ROUTES - INVENTORY
# =============================================================================

@app.route('/api/hosts')
def get_hosts():
    hosts = parse_inventory_file()
    return jsonify(hosts)


@app.route('/api/create-host', methods=['POST'])
def create_host():
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        ip = data.get('ip', '').strip()
        user = data.get('user', '').strip()
        connection = data.get('connection', '').strip()
        
        home_dir = os.path.expanduser("~")
        inventory_path = os.path.join(home_dir, "ansible_quickstart", "inventory.ini")
        
        if not os.path.exists(inventory_path):
            return jsonify({'success': False, 'error': 'Inventory file not found'})

        host_line = f"{name}"
        if ip:
            host_line += f" ansible_host={ip}"
        if connection:
            host_line += f" ansible_connection={connection}"
        if user:
            host_line += f" ansible_user={user}"
        host_line += "\n"

        with open(inventory_path, 'r') as f:
            lines = f.readlines()

        group_found = False
        new_lines = []
        
        for line in lines:
            new_lines.append(line)
            if line.strip() == "[myhosts]":
                group_found = True

        if group_found:
            idx = next(i for i, line in enumerate(new_lines) if line.strip() == "[myhosts]")
            insert_idx = len(new_lines)
            
            for i in range(idx + 1, len(new_lines)):
                if new_lines[i].startswith("[") and new_lines[i].endswith("]"):
                    insert_idx = i
                    break
            
            new_lines.insert(insert_idx, host_line)
        else:
            new_lines.extend(["\n[myhosts]\n", host_line])

        with open(inventory_path, 'w') as f:
            f.writelines(new_lines)

        return jsonify({'success': True, 'message': f'Host {name} created in [myhosts]'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to create host: {str(e)}'})


@app.route('/api/delete-host', methods=['POST'])
def delete_host():
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        
        home_dir = os.path.expanduser("~")
        inventory_path = os.path.join(home_dir, "ansible_quickstart", "inventory.ini")
        
        if not os.path.exists(inventory_path):
            return jsonify({'success': False, 'error': 'Inventory file not found'})
        
        with open(inventory_path, 'r') as f:
            lines = f.readlines()
        
        new_lines = [
            line for line in lines 
            if not (line.strip().startswith(f"{name} ") or line.strip() == name)
        ]
        
        with open(inventory_path, 'w') as f:
            f.writelines(new_lines)
        
        return jsonify({'success': True, 'message': f'Host {name} deleted'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to delete host: {str(e)}'})


@app.route('/api/create-group', methods=['POST'])
def create_group():
    try:
        data = request.get_json()
        group_name = data.get('group_name', '').strip()
        hosts = data.get('hosts', [])

        if not group_name or not hosts:
            return jsonify({'success': False, 'error': 'Group name and hosts required'})

        home_dir = os.path.expanduser("~")
        inventory_path = os.path.join(home_dir, "ansible_quickstart", "inventory.ini")

        if not os.path.exists(inventory_path):
            return jsonify({'success': False, 'error': 'Inventory file not found'})

        new_group = f"\n[{group_name}]\n"
        host_lines = []
        
        for host in hosts:
            line = host.get('name', '')
            if host.get('ip'):
                line += f" ansible_host={host['ip']}"
            if host.get('connection'):
                line += f" ansible_connection={host['connection']}"
            if host.get('user'):
                line += f" ansible_user={host['user']}"
            
            new_group += line + "\n"
            host_lines.append(line)

        with open(inventory_path, 'a') as f:
            f.write(new_group)

        return jsonify({
            'success': True, 
            'message': f'Group {group_name} created with hosts: {", ".join(host_lines)}'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to create group: {str(e)}'})


@app.route('/api/delete-group', methods=['POST'])
def delete_group():
    try:
        data = request.get_json()
        group_name = data.get('group_name', '').strip()
        
        home_dir = os.path.expanduser("~")
        inventory_path = os.path.join(home_dir, "ansible_quickstart", "inventory.ini")
        
        if not os.path.exists(inventory_path):
            return jsonify({'success': False, 'error': 'Inventory file not found'})
        
        with open(inventory_path, 'r') as f:
            lines = f.readlines()
        
        new_lines = []
        in_group = False
        
        for line in lines:
            if line.strip().startswith(f"[{group_name}]"):
                in_group = True
                continue
            
            if in_group and line.startswith('['):
                in_group = False
            
            if not in_group:
                new_lines.append(line)
        
        with open(inventory_path, 'w') as f:
            f.writelines(new_lines)
        
        return jsonify({'success': True, 'message': f'Group {group_name} deleted'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to delete group: {str(e)}'})

# =============================================================================
# API ROUTES - PLAYBOOK
# =============================================================================

def get_playbook_paths(filename=None):
    paths = [
        os.path.join(os.path.expanduser("~"), "ansible_quickstart", "playbooks"),
        "/root/ansible_quickstart/playbooks"
    ]
    
    if filename:
        for d in paths:
            candidate = os.path.join(d, filename)
            if os.path.exists(candidate):
                return candidate
        return None
    else:
        found = {}
        for d in paths:
            if os.path.exists(d):
                for f in os.listdir(d):
                    if f.endswith(('.yml', '.yaml')) and f not in found:
                        found[f] = os.path.join(d, f)
        return found

@app.route('/api/playbooks')
def get_playbooks_api():
    playbooks = get_playbooks()
    return jsonify(playbooks)


@app.route('/api/get-playbook/<filename>')
def get_playbook(filename):
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'error': 'Not logged in'})
    role = db.session.get(Role, user.role_id).name if user.role_id else 'user' 
    if role == 'admin':
        playbook_path = get_playbook_paths(filename)
    else:
        home_dir = os.path.expanduser("~")
        playbook_path = os.path.join(home_dir, "ansible_quickstart", "playbooks", filename)
    if not playbook_path or not os.path.exists(playbook_path):
        return jsonify({'success': False, 'error': f'Playbook {filename} not found'})
    with open(playbook_path, 'r') as file:
        content = file.read()
    description = ""
    lines = content.split('\n')
    if lines and lines[0].startswith('# Description: '):
        description = lines[0].replace('# Description: ', '')
        content = '\n'.join(lines[1:]).strip()
    playbook_name = os.path.splitext(filename)[0]
    return jsonify({
        'success': True,
        'name': playbook_name,
        'description': description,
        'content': content,
        'filename': filename
    })


@app.route('/api/save-playbook', methods=['POST'])
def save_playbook():
    try:
        user = get_current_user()
        if not user:
            return jsonify({'success': False, 'error': 'Not logged in'})
        data = request.get_json()
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        content = data.get('content', '').strip()
        filename = name
        if not filename.endswith(('.yml', '.yaml')):
            filename += '.yml'
        try:
            yaml.safe_load(content)
        except Exception as e:
            return jsonify({'success': False, 'error': f'Invalid YAML syntax: {str(e)}'})
        playbooks_dir = os.path.join(os.path.expanduser("~"), "ansible_quickstart", "playbooks")
        if not os.path.exists(playbooks_dir):
            os.makedirs(playbooks_dir)
        playbook_path = os.path.join(playbooks_dir, filename)
        if os.path.exists(playbook_path):
            return jsonify({'success': False, 'error': f'Playbook {filename} already exists'})
        final_content = content
        if description:
            final_content = f"# Description: {description}\n{content}"
        with open(playbook_path, 'w') as file:
            file.write(final_content)
        return jsonify({
            'success': True,
            'filename': filename,
            'path': playbook_path,
            'message': f'Playbook {filename} saved successfully'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to save playbook: {str(e)}'})


@app.route('/api/update-playbook', methods=['POST'])
def update_playbook():
    try:
        user = get_current_user()
        if not user:
            return jsonify({'success': False, 'error': 'Not logged in'})
        role = db.session.get(Role, user.role_id).name if user.role_id else 'user' 
        data = request.get_json()
        original_filename = data.get('original_filename')
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        content = data.get('content', '').strip()
        filename = name
        if not filename.endswith(('.yml', '.yaml')):
            filename += '.yml'
        try:
            yaml.safe_load(content)
        except yaml.YAMLError as e:
            return jsonify({'success': False, 'error': f'Invalid YAML syntax: {str(e)}'})
        if role == 'admin':
            original_path = get_playbook_paths(original_filename)
        else:
            home_dir = os.path.expanduser("~")
            original_path = os.path.join(home_dir, "ansible_quickstart", "playbooks", original_filename)
        if not original_path or not os.path.exists(original_path):
            return jsonify({'success': False, 'error': f'Original playbook {original_filename} not found'})
        new_path = os.path.join(os.path.dirname(original_path), filename)
        if filename != original_filename and os.path.exists(new_path):
            return jsonify({'success': False, 'error': f'Playbook {filename} already exists'})
        final_content = content
        if description:
            final_content = f"# Description: {description}\n{content}"
        with open(new_path, 'w') as f:
            f.write(final_content)
        if filename != original_filename:
            os.remove(original_path)
        return jsonify({
            'success': True,
            'filename': filename,
            'path': new_path,
            'message': f'Playbook {filename} updated successfully'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to update playbook: {str(e)}'})


@app.route('/api/delete-playbook/<filename>', methods=['DELETE'])
def delete_playbook(filename):
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'error': 'Not logged in'})
    role = db.session.get(Role, user.role_id).name if user.role_id else 'user' 
    if role == 'admin':
        playbook_path = get_playbook_paths(filename)
    else:
        home_dir = os.path.expanduser("~")
        playbook_path = os.path.join(home_dir, "ansible_quickstart", "playbooks", filename)
    if not playbook_path or not os.path.exists(playbook_path):
        return jsonify({'success': False, 'error': f'Playbook {filename} not found'})
    os.remove(playbook_path)
    return jsonify({
        'success': True,
        'filename': filename,
        'message': f'Playbook {filename} deleted successfully'
    })


@app.route('/api/execute', methods=['POST'])
def execute_playbook():
    try:
        user = get_current_user()
        if not user:
            return jsonify({'success': False, 'error': 'Not logged in'})
        role = db.session.get(Role, user.role_id).name if user.role_id else 'user' 
        data = request.get_json()
        hosts = data.get('hosts')
        playbook = data.get('playbook')
        if not hosts or not playbook:
            return jsonify({'success': False, 'error': 'Missing hosts or playbook parameter'})
        home_dir = os.path.expanduser("~")
        inventory_path = os.path.join(home_dir, "ansible_quickstart", "inventory.ini")
        if role == 'admin':
            playbook_path = get_playbook_paths(playbook)
        else:
            playbook_path = os.path.join(home_dir, "ansible_quickstart", "playbooks", playbook)
        if not os.path.exists(inventory_path):
            return jsonify({'success': False, 'error': 'Inventory file not found'})
        if not playbook_path:
            return jsonify({'success': False, 'error': 'Playbook file not found'})
        cmd = [
            'ansible-playbook',
            '-i', inventory_path,
            playbook_path,
            '-v'
        ]
        if hosts != 'all':
            cmd.extend(['--limit', hosts])
        cmd_string = " ".join(cmd)
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=1800
        )
        output = f"Command: {cmd_string}\n\nSTDOUT:\n{result.stdout}\n\n"
        if result.stderr:
            output += f"STDERR:\n{result.stderr}\n\n"
        output += f"Return code: {result.returncode}\n"
        return jsonify({
            'success': result.returncode == 0,
            'output': output,
            'return_code': result.returncode
        })
    except subprocess.TimeoutExpired:
        return jsonify({'success': False, 'error': 'Command timed out after 30 minutes'})
    except Exception as e:
        return jsonify({'success': False, 'error': f'Execution error: {str(e)}'})

# =============================================================================
# API ROUTES - SLURM JOB MANAGEMENT
# =============================================================================

@app.route('/api/jobs')
def get_jobs_api():
    jobs = get_jobs()
    return jsonify(jobs)


@app.route('/api/get-job/<filename>')
def get_job(filename):
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'error': 'Not logged in'})
    role = db.session.get(Role, user.role_id).name if user.role_id else 'user' 

    job_path = None
    if role == 'admin':
        import glob
        for jobs_dir in glob.glob('/home/*/slurm_jobs'):
            candidate = os.path.join(jobs_dir, filename)
            if os.path.exists(candidate):
                job_path = candidate
                break
    else:
        jobs_dir = f'/home/{user.username}/slurm_jobs'
        job_path = os.path.join(jobs_dir, filename)

    if not job_path or not os.path.exists(job_path):
        return jsonify({'success': False, 'error': f'Job {filename} not found'})

    with open(job_path, 'r') as file:
        content = file.read()

    description = ""
    lines = content.split('\n')
    if lines and lines[0].startswith('# Description: '):
        description = lines[0].replace('# Description: ', '')
        content = '\n'.join(lines[1:]).strip()

    job_name = os.path.splitext(filename)[0]

    return jsonify({
        'success': True,
        'name': job_name,
        'description': description,
        'content': content,
        'filename': filename
    })

def prepend_description_to_script(content, description):
    lines = content.splitlines()
    if lines and lines[0].startswith("#!"):
        shebang = lines[0]
        rest = "\n".join(lines[1:])
        if description:
            return f"{shebang}\n# Description: {description}\n{rest}"
        else:
            return content
    else:
        if description:
            return f"# Description: {description}\n{content}"
        else:
            return content

@app.route('/api/save-job', methods=['POST'])
def save_job():
    try:
        user = get_current_user()
        if not user:
            return jsonify({'success': False, 'error': 'Not logged in'})
        role = db.session.get(Role, user.role_id).name if user.role_id else 'user' 

        data = request.get_json()
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        content = data.get('content', '').strip()
        target_user = user.username

        if role == 'admin' and 'target_user' in data:
            target_user = data['target_user']

        if not name or not content:
            return jsonify({'success': False, 'error': 'Name and content are required'})

        filename = name
        if not filename.endswith(('.sh', '.slurm')):
            filename += '.sh'

        jobs_dir = f'/home/{target_user}/slurm_jobs'
        if not os.path.exists(jobs_dir):
            os.makedirs(jobs_dir)

        job_path = os.path.join(jobs_dir, filename)
        if os.path.exists(job_path):
            return jsonify({'success': False, 'error': f'Job {filename} already exists'})

        final_content = content
        if description:
            final_content = prepend_description_to_script(content, description)

        with open(job_path, 'w') as file:
            file.write(final_content)

        os.chmod(job_path, 0o755)

        try:
            user_info = pwd.getpwnam(target_user)
            os.chown(job_path, user_info.pw_uid, user_info.pw_gid)
            os.chown(jobs_dir, user_info.pw_uid, user_info.pw_gid)
        except KeyError:
            try:
                stat_info = os.stat(f'/home/{target_user}')
                os.chown(job_path, stat_info.st_uid, stat_info.st_gid)
                os.chown(jobs_dir, stat_info.st_uid, stat_info.st_gid)
            except:
                pass

        return jsonify({
            'success': True,
            'filename': filename,
            'path': job_path,
            'message': f'Job {filename} saved successfully'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to save job: {str(e)}'})


@app.route('/api/delete-job/<filename>', methods=['DELETE'])
def delete_job(filename):
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'error': 'Not logged in'})
    role = db.session.get(Role, user.role_id).name if user.role_id else 'user' 

    job_path = None
    if role == 'admin':
        import glob
        for jobs_dir in glob.glob('/home/*/slurm_jobs'):
            candidate = os.path.join(jobs_dir, filename)
            if os.path.exists(candidate):
                job_path = candidate
                break
    else:
        jobs_dir = f'/home/{user.username}/slurm_jobs'
        job_path = os.path.join(jobs_dir, filename)

    if not job_path or not os.path.exists(job_path):
        return jsonify({'success': False, 'error': f'Job {filename} not found'})

    os.remove(job_path)

    return jsonify({
        'success': True,
        'filename': filename,
        'message': f'Job {filename} deleted successfully'
    })


@app.route('/api/execute-job', methods=['POST'])
def execute_job():
    try:
        data = request.get_json()
        job_filename = data.get('job')
        hosts = data.get('hosts')
        single_app = data.get('application')
        app_list = data.get('applications') or ([single_app] if single_app else [])
        
        if not job_filename or not hosts:
            return jsonify({'success': False, 'error': 'Missing job or hosts parameter'})
        
        user = get_current_user()
        if not user:
            return jsonify({'success': False, 'error': 'Not logged in'})
        executing_username = user.username
        
        jobs_dir = f"/home/{executing_username}/slurm_jobs"
        job_path = os.path.join(jobs_dir, job_filename)
        
        if not os.path.exists(job_path):
            return jsonify({'success': False, 'error': 'Job file not found'})
        
        original_content = None
        if app_list:
            with open(job_path, 'r') as f:
                original_content = f.read()
            
            modified_content = original_content
            for app_cfg in app_list:
                if app_cfg:
                    modified_content = inject_application_setup(modified_content, app_cfg)
            
            with open(job_path, 'w') as f:
                f.write(modified_content)
            os.chmod(job_path, 0o755)
        
        env = os.environ.copy()
        if app_list:
            env['SELECTED_APPLICATION'] = ",".join([a.get('name','') for a in app_list if a])
            env['APPLICATION_TYPE'] = ",".join([(a.get('manifest') or {}).get('type','') for a in app_list if a])
        
        cmd = ['sudo', '-u', executing_username, 'sbatch', 
               f'--output=/home/{executing_username}/slurm-output-%j.log', 
               f'--chdir=/home/{executing_username}']
        
        if hosts != 'all':
            cmd.extend(['--nodelist', hosts])
        
        cmd.append(job_path)

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800, env=env)
        
        if original_content is not None:
            with open(job_path, 'w') as f:
                f.write(original_content)
            os.chmod(job_path, 0o755)
        
        output = f"Starting execution of {job_filename} on {hosts}...\n"
        output += f"Command: {' '.join(cmd)}\n\nSTDOUT:\n{result.stdout}\n\n"
        if result.stderr:
            output += f"STDERR:\n{result.stderr}\n\n"
        output += f"Return code: {result.returncode}\n"

        job_id = None
        if result.returncode == 0 and result.stdout:
            import re
            match = re.search(r'Submitted batch job (\d+)', result.stdout)
            if match:
                job_id = match.group(1)

        return jsonify({
            'success': result.returncode == 0,
            'output': output,
            'return_code': result.returncode,
            'username': executing_username,
            'job_id': job_id
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({'success': False, 'error': 'Command timed out after 30 minutes'})
    except Exception as e:
        return jsonify({'success': False, 'error': f'Execution error: {str(e)}'})
    

@app.route('/api/job-output/<job_id>')
def get_job_output(job_id):
    try:
        user = get_current_user()
        if not user:
            return jsonify({'success': False, 'error': 'Not logged in'})
        
        sacct_cmd = [
            'sacct', 
            '-j', job_id,
            '--format=JobID,JobName,Partition,User,NodeList,State,Start,End,Elapsed,ExitCode'
        ]
        
        sacct_result = subprocess.run(sacct_cmd, capture_output=True, text=True, timeout=10)
        
        if sacct_result.returncode != 0:
            return jsonify({
                'success': False, 
                'error': f'Failed to get job data: {sacct_result.stderr}'
            })
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'sacct_output': sacct_result.stdout,
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to get job information: {str(e)}'})
    
@app.route('/api/slurm-queue')
def slurm_queue():
    try:
        user = get_current_user()
        if not user:
            return jsonify({'success': False, 'error': 'Not logged in'})
        
        username = user.username
        role = db.session.get(Role, user.role_id).name if user.role_id else 'user'
        
        if role == 'admin':
            squeue_cmd = [
                'squeue',
                '-o', '%.18i %.9P %.8j %.8u %.2t %.10M %.6D %R'
            ]
        else:
            squeue_cmd = [
                'squeue',
                '-u', username,
                '-o', '%.18i %.9P %.8j %.8u %.2t %.10M %.6D %R'
            ]
        
        result = subprocess.run(squeue_cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode != 0:
            return jsonify({
                'success': False, 
                'error': f'Failed to get queue data: {result.stderr}'
            })
        
        return jsonify({
            'success': True,
            'output': result.stdout
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to get queue information: {str(e)}'})

# =============================================================================
# API ROUTES - USER AUTHENTICATION & MANAGEMENT
# =============================================================================

@app.route('/api/register', methods=['POST'])
def register_user():
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()
        full_name = data.get('full_name', '').strip()
        
        if not all([username, email, password, full_name]):
            return jsonify({'success': False, 'error': 'All fields are required'})
        
        if User.query.filter_by(username=username).first():
            return jsonify({'success': False, 'error': 'Username already exists'})
        
        if User.query.filter_by(email=email).first():
            return jsonify({'success': False, 'error': 'Email already exists'})
        
        role = Role.query.filter_by(name='user').first()
        if not role:
            role = Role(name='user', description='Standard user')
            db.session.add(role)
            db.session.commit()
        
        user = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            role_id=role.id,
            created_at=datetime.now(timezone.utc)
        )
        
        db.session.add(user)
        db.session.commit()

        uid, gid = get_next_uid_gid()
        key_path = f"/tmp/{username}"
        pub_key_path = key_path + '.pub'

        if os.path.exists(key_path):
            os.remove(key_path)
        if os.path.exists(pub_key_path):
            os.remove(pub_key_path)

        subprocess.run(['ssh-keygen', '-t', 'rsa', '-b', '4096', '-N', '', '-f', key_path], check=True)
        home_dir = os.path.expanduser("~")
        inventory_path = os.path.join(home_dir, "ansible_quickstart", "inventory.ini")
        playbook_path = os.path.join(home_dir, "ansible_quickstart", "playbooks", "create_user.yml")
        cmd = [
            'ansible-playbook', '-i', inventory_path, playbook_path,
            '-e', f'username={username}', '-e', f'uid={uid}', '-e', f'gid={gid}'
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            print("Ansible STDOUT:", result.stdout)
            print("Ansible STDERR:", result.stderr)
            print("Ansible returncode:", result.returncode)
        except Exception as e:
            print("subprocess.run error :", str(e))
        os.remove(pub_key_path)

        token = str(uuid.uuid4())
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        session = Session(
            user_id=user.id,
            session_token=token,
            created_at=datetime.now(timezone.utc),
            expires_at=expiry,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent', '')
        )
        db.session.add(session)
        user.last_login = datetime.now(timezone.utc)
        db.session.commit()
        resp = make_response(jsonify({
            'success': True,
            'message': 'User registered and created on nodes successfully',
            'username': user.username,
            'role': user.role_id
        }))
        resp.set_cookie('session_token', token, expires=expiry, httponly=True, samesite='Lax')
        return resp

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Registration failed: {str(e)}'})


@app.route('/api/login', methods=['POST'])
def login_user():
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        user = User.query.filter_by(username=username).first()
        if not user or not verify_password(password, user.password_hash):
            return jsonify({'success': False, 'error': 'Invalid credentials'})
        
        token = str(uuid.uuid4())
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        
        session = Session(
            user_id=user.id,
            session_token=token,
            created_at=datetime.now(timezone.utc),
            expires_at=expiry,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent', '')
        )
        
        db.session.add(session)
        
        user.last_login = datetime.now(timezone.utc)
        db.session.commit()
        
        resp = make_response(jsonify({
            'success': True,
            'message': 'Login successful',
            'username': user.username,
            'role': user.role_id
        }))
        resp.set_cookie('session_token', token, expires=expiry, httponly=True, samesite='Lax')
        
        return resp
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Login failed: {str(e)}'})


@app.route('/api/logout', methods=['POST'])
def logout_user():
    try:
        token = request.cookies.get('session_token')
        if token:
            Session.query.filter_by(session_token=token).delete()
            db.session.commit()
        
        resp = make_response(jsonify({'success': True, 'message': 'Logged out'}))
        resp.set_cookie('session_token', '', expires=0)
        
        return resp
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Logout failed: {str(e)}'})


@app.route('/api/get-profile', methods=['GET'])
def get_profile():
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'error': 'Not logged in'})
    
    return jsonify({
        'success': True,
        'username': user.username,
        'full_name': user.full_name,
        'email': user.email,
        'role': user.role_id,
        'created_at': user.created_at.isoformat() if user.created_at else None,
        'last_login': user.last_login.isoformat() if user.last_login else None
    })


@app.route('/api/update-profile', methods=['POST'])
def update_profile():
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'error': 'Not logged in'})
    
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        full_name = data.get('full_name', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()

        old_username = user.username
        username_changed = False

        if username and username != user.username:
            if User.query.filter_by(username=username).first():
                return jsonify({'success': False, 'error': 'Username already exists'})
            user.username = username
            username_changed = True
        
        if email and email != user.email:
            if User.query.filter_by(email=email).first():
                return jsonify({'success': False, 'error': 'Email already exists'})
            user.email = email
        
        if full_name:
            user.full_name = full_name
        
        if password:
            user.password_hash = hash_password(password)
        
        db.session.commit()

        if username_changed:
            home_dir = os.path.expanduser("~")
            inventory_path = os.path.join(home_dir, "ansible_quickstart", "inventory.ini")
            playbook_path = os.path.join(home_dir, "ansible_quickstart", "playbooks", "rename_user.yml")
            cmd = [
                'ansible-playbook', '-i', inventory_path, playbook_path,
                '-e', f'old_username={old_username}', '-e', f'new_username={username}'
            ]
            subprocess.run(cmd, check=True)
        
        return jsonify({'success': True, 'message': 'Profile updated successfully'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Profile update failed: {str(e)}'})

# =============================================================================
# API ROUTES - ADMIN DASHBOARD
# =============================================================================
@app.route('/api/users', methods=['GET'])
def get_users():
    user = get_current_user()
    if not user or user.role_id != Role.query.filter_by(name='admin').first().id:
        return jsonify({'success': False, 'error': 'Access denied'}), 403

    users = User.query.all()
    result = []
    for u in users:
        result.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'full_name': u.full_name,
            'role': db.session.get(Role, u.role_id).name if u.role_id else 'user',
            'applications': [app.app_id for app in u.applications],
            'created_at': u.created_at.isoformat() if u.created_at else None,
            'last_login': u.last_login.isoformat() if u.last_login else None
        })
    return jsonify({'success': True, 'users': result})

def get_next_uid_gid():
    min_uid = 1001
    used_uids = {u.pw_uid for u in pwd.getpwall() if u.pw_uid >= min_uid}
    used_gids = {g.gr_gid for g in grp.getgrall() if g.gr_gid >= min_uid}
    uid = gid = min_uid
    while uid in used_uids:
        uid += 1
    while gid in used_gids:
        gid += 1
    return uid, gid

@app.route('/api/create-user', methods=['POST'])
def create_user():
    user = get_current_user()
    if not user or user.role_id != Role.query.filter_by(name='admin').first().id:
        return jsonify({'success': False, 'error': 'Access denied'}), 403

    data = request.get_json()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()
    full_name = data.get('full_name', '').strip()
    role_name = data.get('role', 'user')
    applications = data.get('applications', [])

    if not all([username, email, password, full_name]):
        return jsonify({'success': False, 'error': 'All fields are required'})

    if User.query.filter_by(username=username).first():
        return jsonify({'success': False, 'error': 'Username already exists'})
    if User.query.filter_by(email=email).first():
        return jsonify({'success': False, 'error': 'Email already exists'})

    role = Role.query.filter_by(name=role_name).first()
    if not role:
        role = Role(name=role_name, description=f'{role_name.capitalize()} user')
        db.session.add(role)
        db.session.commit()

    new_user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        role_id=role.id,
        created_at=datetime.now(timezone.utc)
    )
    db.session.add(new_user)
    db.session.commit()
    
    if applications:
        apps = Application.query.filter(Application.app_id.in_(applications)).all()
        new_user.applications = apps
        db.session.commit()

    uid, gid = get_next_uid_gid()

    key_path = f"/tmp/{username}"
    pub_key_path = key_path + '.pub'

    if os.path.exists(key_path):
        os.remove(key_path)
    if os.path.exists(pub_key_path):
        os.remove(pub_key_path)

    subprocess.run(['ssh-keygen', '-t', 'rsa', '-b', '4096', '-N', '', '-f', key_path], check=True)

    home_dir = os.path.expanduser("~")
    inventory_path = os.path.join(home_dir, "ansible_quickstart", "inventory.ini")
    playbook_path = os.path.join(home_dir, "ansible_quickstart", "playbooks", "create_user.yml")
    cmd = [
        'ansible-playbook', '-i', inventory_path, playbook_path,
        '-e', f'username={username}', '-e', f'uid={uid}', '-e', f'gid={gid}'
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        print("Ansible STDOUT:", result.stdout)
        print("Ansible STDERR:", result.stderr)
        print("Ansible returncode:", result.returncode)
    except Exception as e:
        print("subprocess.run error:", str(e))

    os.remove(pub_key_path)

    return jsonify({'success': True, 'message': 'User created successfully'})

@app.route('/api/update-user', methods=['POST'])
def update_user():
    user = get_current_user()
    if not user or user.role_id != Role.query.filter_by(name='admin').first().id:
        return jsonify({'success': False, 'error': 'Access denied'}), 403

    data = request.get_json()
    user_id = data.get('id')
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    full_name = data.get('full_name', '').strip()
    password = data.get('password', '').strip()
    role_name = data.get('role', '').strip()
    applications = data.get('applications', [])

    target_user = db.session.get(User, user_id)
    if not target_user:
        return jsonify({'success': False, 'error': 'User not found'})

    old_username = target_user.username
    username_changed = False

    if username and username != target_user.username:
        if User.query.filter_by(username=username).first():
            return jsonify({'success': False, 'error': 'Username already exists'})
        target_user.username = username
        username_changed = True

    if email and email != target_user.email:
        if User.query.filter_by(email=email).first():
            return jsonify({'success': False, 'error': 'Email already exists'})
        target_user.email = email

    if full_name:
        target_user.full_name = full_name

    if password:
        target_user.password_hash = hash_password(password)

    if role_name:
        role = Role.query.filter_by(name=role_name).first()
        if role:
            target_user.role_id = role.id
    
    if applications is not None:
        apps = Application.query.filter(Application.app_id.in_(applications)).all()
        target_user.applications = apps

    db.session.commit()

    if username_changed:
        home_dir = os.path.expanduser("~")
        inventory_path = os.path.join(home_dir, "ansible_quickstart", "inventory.ini")
        playbook_path = os.path.join(home_dir, "ansible_quickstart", "playbooks", "rename_user.yml")
        cmd = [
            'ansible-playbook', '-i', inventory_path, playbook_path,
            '-e', f'old_username={old_username}', '-e', f'new_username={username}'
        ]
        subprocess.run(cmd, check=True)

    return jsonify({'success': True, 'message': 'User updated successfully'})

@app.route('/api/delete-user', methods=['POST'])
def delete_user():
    user = get_current_user()
    if not user or user.role_id != Role.query.filter_by(name='admin').first().id:
        return jsonify({'success': False, 'error': 'Access denied'}), 403

    data = request.get_json()
    user_id = data.get('id')
    target_user = db.session.get(User, user_id)
    if not target_user:
        return jsonify({'success': False, 'error': 'User not found'})

    username = target_user.username

    home_dir = os.path.expanduser("~")
    inventory_path = os.path.join(home_dir, "ansible_quickstart", "inventory.ini")
    playbook_path = os.path.join(home_dir, "ansible_quickstart", "playbooks", "delete_user.yml")
    cmd = [
        'ansible-playbook', '-i', inventory_path, playbook_path,
        '-e', f'username={username}'
    ]
    subprocess.run(cmd, check=True)

    Session.query.filter_by(user_id=target_user.id).delete()
    db.session.delete(target_user)
    db.session.commit()
    return jsonify({'success': True, 'message': 'User deleted successfully'})

# =============================================================================
# SLURM REPORTS
# =============================================================================
slurm_engine = create_engine(os.environ.get('SLURM_DB_URL'))

@app.route('/api/slurm-report', methods=['GET'])
def slurm_report():
    user = request.args.get('user', '')
    state = request.args.get('state', '')
    start = request.args.get('start', '')
    end = request.args.get('end', '')

    query = """
        SELECT
            j.id_job AS jobid,
            u.name AS user,
            j.job_name,
            j.partition,
            j.state,
            j.time_submit,
            j.time_start,
            j.time_end,
            j.nodes_alloc,
            j.nodelist,
            j.cpus_req,
            j.mem_req,
            j.timelimit,
            GREATEST(COALESCE(j.time_end,0) - COALESCE(j.time_start,0), 0) AS elapsed,
            j.priority,
            j.work_dir
        FROM `slurm-cluster_job_table` j
        LEFT JOIN `user_table` u ON j.id_user = u.uid
        WHERE 1=1
    """
    params = {}
    if user:
        query += " AND u.name=:user"
        params['user'] = user
    if state:
        query += " AND j.state=:state"
        params['state'] = state
    if start:
        query += " AND j.time_start>=:start"
        params['start'] = start
    if end:
        query += " AND j.time_end<=:end"
        params['end'] = end

    query += " ORDER BY j.time_submit DESC LIMIT 100"

    with slurm_engine.connect() as conn:
        result = conn.execute(text(query), params)
        jobs = [dict(row) for row in result.mappings()]

    return jsonify({'success': True, 'jobs': jobs})

# =============================================================================
# APPLICATION STARTUP
# =============================================================================

def create_default_roles():
    try:
        if not Role.query.filter_by(name='admin').first():
            admin_role = Role(name='admin', description='Administrator')
            db.session.add(admin_role)
        
        if not Role.query.filter_by(name='user').first():
            user_role = Role(name='user', description='Standard user')
            db.session.add(user_role)
        
        db.session.commit()
        print("Default roles created successfully")
        
    except Exception as e:
        db.session.rollback()
        print(f"Error creating default roles: {str(e)}")

if __name__ == '__main__':
    with app.app_context():
        try:
            db.create_all()
            print("Database tables created successfully")
            create_default_roles()
            initialize_directories()
            sync_applications_table()
            
        except Exception as e:
            print(f"Initialization error: {str(e)}")
    
    app.run(debug=True, host='0.0.0.0', port=8080)
