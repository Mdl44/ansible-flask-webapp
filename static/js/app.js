var isEditMode = false;
var originalFilename = '';
window.isJobEditMode = false;
window.originalJobFilename = '';
window.currentUser = null;

/*
================================================================================
                           INITIALIZATION & SETUP
================================================================================
*/

document.addEventListener('DOMContentLoaded', function () {
    hideSpinner();
    initializeInterface();
    setupEventListeners();
    checkUserAuthentication();
    setupDashboardEventListeners();
    setupSlurmReportEvents();
    loadApplications();
});

function initializeInterface() {
    loadHosts();
    loadPlaybooks();
    loadJobs();
    loadGroupsDropdown();
    loadHostsForGroup([]);
    loadJobHosts();
    loadHostsDropdownForHostTab();
}

function showSpinner() {
    document.getElementById('globalSpinner').style.display = 'flex';
}

function hideSpinner() {
    document.getElementById('globalSpinner').style.display = 'none';
}

function checkUserAuthentication() {
    fetch('/api/get-profile')
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                window.currentUser = {
                    username: res.username,
                    role: res.role
                };
            } else {
                window.currentUser = null;
            }
            updateTabsAndButtonsByRole();
            if (window.currentUser && window.currentUser.role !== 1) {
                try {
                    switchTab('jobExecute');
                } catch (e) {
                }
            }
        });
}
/*
================================================================================
                              EVENT LISTENERS
================================================================================
*/

function setupEventListeners() {
    setupMainEventListeners();
    setupPlaybookEventListeners();
    setupHostEventListeners();
    setupGroupEventListeners();
    setupJobEventListeners();
    setupAuthEventListeners();
}

function setupMainEventListeners() {
    document.getElementById('executeBtn').addEventListener('click', executePlaybook);
    document.getElementById('clearBtn').addEventListener('click', clearOutput);
    document.getElementById('refreshBtn').addEventListener('click', refreshLists);

    document.querySelector('.tab-user').onclick = function () {
        if (window.currentUser) {
            switchTab('profile');
            loadProfile();
        } else {
            switchTab('login');
        }
    };
}

function setupPlaybookEventListeners() {
    document.getElementById('savePlaybookBtn').addEventListener('click', savePlaybook);
    document.getElementById('clearCreatorBtn').addEventListener('click', clearCreatorForm);
    document.getElementById('editPlaybookBtn').addEventListener('click', editSelectedPlaybook);
    document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
    document.getElementById('deletePlaybookBtn').addEventListener('click', deletePlaybook);

    document.getElementById('createNewPlaybookBtn').addEventListener('click', function () {
        document.getElementById('playbookCreatorSection').style.display = 'block';
        document.getElementById('playbookDropdownSection').style.display = 'none';
        clearCreatorForm();
    });
    document.getElementById('manageExistingPlaybookBtn').addEventListener('click', function () {
        document.getElementById('playbookCreatorSection').style.display = 'none';
        document.getElementById('playbookDropdownSection').style.display = 'block';
        loadPlaybooksDropdownForEdit();
    });
    document.getElementById('editSelectedPlaybookBtn').addEventListener('click', function () {
        var selected = document.getElementById('playbooksDropdown').value;
        if (selected) loadPlaybookForEdit(selected);
    });
}

function setupHostEventListeners() {
    document.getElementById('hostSelect').addEventListener('change', onHostSelectChange);
    document.getElementById('saveHostBtn').addEventListener('click', saveHost);
    document.getElementById('editHostBtn').addEventListener('click', editSelectedHost);
    document.getElementById('deleteHostBtn').addEventListener('click', deleteSelectedHost);
    document.getElementById('clearHostFormBtn').addEventListener('click', clearHostForm);

    document.getElementById('createNewJobBtn').addEventListener('click', function () {
        document.getElementById('jobCreatorSection').style.display = 'block';
        document.getElementById('jobDropdownSection').style.display = 'none';
        clearJobForm();
    });
    document.getElementById('manageExistingJobBtn').addEventListener('click', function () {
        document.getElementById('jobCreatorSection').style.display = 'none';
        document.getElementById('jobDropdownSection').style.display = 'block';
        loadJobsDropdownForEdit();
    });
    document.getElementById('editSelectedJobBtn').addEventListener('click', function () {
        var selected = document.getElementById('jobsDropdown').value;
        if (selected) loadJobForEdit(selected);
    });
}

function setupGroupEventListeners() {
    document.getElementById('groupSelect').addEventListener('change', onGroupSelectChange);
    document.getElementById('saveGroupBtn').addEventListener('click', saveGroup);
    document.getElementById('editGroupBtn').addEventListener('click', editSelectedGroup);
    document.getElementById('deleteGroupBtn').addEventListener('click', deleteSelectedGroup);
    document.getElementById('clearGroupFormBtn').addEventListener('click', clearGroupForm);
}

function setupJobEventListeners() {
    document.getElementById('executeJobBtn').addEventListener('click', executeJob);
    document.getElementById('refreshJobsBtn').addEventListener('click', refreshJobs);
    document.getElementById('clearJobOutputBtn').addEventListener('click', clearJobOutput);
    document.getElementById('editJobBtn').addEventListener('click', editSelectedJob);
    document.getElementById('saveJobBtn').addEventListener('click', saveJob);
    document.getElementById('cancelJobEditBtn').addEventListener('click', cancelJobEdit);
    document.getElementById('deleteJobBtn').addEventListener('click', deleteJob);
    document.getElementById('clearJobFormBtn').addEventListener('click', clearJobForm);

    document.getElementById('checkJobStatusBtn').addEventListener('click', function() {
        fetchJobOutput();
    });
}

function setupAuthEventListeners() {
    setupRegistrationForm();
    setupLoginForm();
    setupProfileForm();
    setupLoginRegisterLink();
}

function setupDashboardEventListeners() {
    const dashboardTabBtn = document.getElementById('dashboardTabBtn');
    if (dashboardTabBtn) {
        dashboardTabBtn.onclick = function () {
            switchTab('dashboard');
        };
    }
    const createUserBtn = document.getElementById('dashboardCreateUserBtn');
    if (createUserBtn) {
        createUserBtn.onclick = function () {
            showDashboardUserForm();
        };
    }
    const cancelUserBtn = document.getElementById('dashboardCancelUserBtn');
    if (cancelUserBtn) {
        cancelUserBtn.onclick = function () {
            hideDashboardUserForm();
        };
    }
    const userForm = document.getElementById('dashboardUserForm');
    if (userForm) {
        userForm.onsubmit = function (e) {
            e.preventDefault();
            saveDashboardUser();
        };
    }
}

/*
================================================================================
                           AUTHENTICATION SYSTEM
================================================================================
*/

function setupRegistrationForm() {
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.onsubmit = function (e) {
            e.preventDefault();
            showSpinner();
            document.getElementById('registerResult').innerHTML =
                `<div class="message-warning">Creating account, please wait...</div>`;
            fetch('/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: document.getElementById('regUsername').value,
                        email: document.getElementById('regEmail').value,
                        password: document.getElementById('regPassword').value,
                        full_name: document.getElementById('regFullName').value,
                        role: 'user'
                    })
                })
                .then(r => r.json())
                .then(res => {
                    hideSpinner();
                    if (res.success) {
                        document.getElementById('registerResult').innerHTML =
                            `<div class="message-success">${res.message}</div>`;
                        window.currentUser = {
                            username: res.username,
                            role: res.role
                        };
                        updateTabsAndButtonsByRole();


                        loadApplications();
                        loadJobs();

                        setTimeout(() => {
                            if (res.role === 1) {
                                switchTab('execute');
                            } else {
                                switchTab('jobExecute');
                            }
                        }, 800);
                    } else {
                        document.getElementById('registerResult').innerHTML =
                            `<div class="message-error">${res.error}</div>`;
                    }
                })
                .catch(() => {
                    hideSpinner();
                    document.getElementById('registerResult').innerHTML =
                        `<div class="message-error">Network error. Please try again.</div>`;
                });
        };
    }
}

function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.onsubmit = function (e) {
            e.preventDefault();
            fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: document.getElementById('loginUsername').value,
                        password: document.getElementById('loginPassword').value
                    })
                })
                .then(r => r.json())
                .then(res => {
                    const loginResult = document.getElementById('loginResult');
                    if (res.success) {
                        loginResult.innerHTML = `<div class="message-success">${res.message}</div>`;
                        window.currentUser = {
                            username: res.username,
                            role: res.role
                        };
                        setTimeout(() => {
                            window.location.reload();
                        }, 500);
                    } else {
                        loginResult.innerHTML = `<div class="message-error">${res.error}</div>`;
                    }
                })
        };
    }
}

function setupProfileForm() {
    document.getElementById('profileForm').onsubmit = function (e) {
        e.preventDefault();
        showSpinner();
        fetch('/api/update-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: document.getElementById('profileUsername').value,
                    full_name: document.getElementById('profileFullName').value,
                    email: document.getElementById('profileEmail').value,
                    password: document.getElementById('profilePassword').value
                })
            })
            .then(r => r.json())
            .then(res => {
                hideSpinner();
                document.getElementById('profileResult').innerHTML =
                    res.success ?
                    `<div class="message-success">${res.message}</div>` :
                    `<div class="message-error">${res.error}</div>`;
                if (res.success) document.getElementById('profilePassword').value = '';
            })
            .catch(() => {
                hideSpinner();
                document.getElementById('profileResult').innerHTML =
                    `<div class="message-error">Network error. Please try again.</div>`;
            });
    };

    document.getElementById('logoutBtn').onclick = function () {
        fetch('/api/logout', {
                method: 'POST'
            })
            .then(r => r.json())
            .then(res => {
                window.currentUser = null;
                updateTabsAndButtonsByRole();
                switchTab('login');
                document.getElementById('loginResult').innerHTML =
                    `<div class="message-success">${res.message || 'Logged out'}</div>`;
            });
    };
}

function setupLoginRegisterLink() {
    const loginRegisterLink = document.querySelector('.login-register-link a');
    if (loginRegisterLink) {
        loginRegisterLink.addEventListener('click', function (e) {
            e.preventDefault();
            switchTab('register');
        });
    }
}

function loadProfile() {
    fetch('/api/get-profile', {
            method: 'GET'
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                document.getElementById('profileUsername').value = res.username || '';
                document.getElementById('profileFullName').value = res.full_name || '';
                document.getElementById('profileEmail').value = res.email || '';
                document.getElementById('profilePassword').value = '';
            }
        });
}

/*
================================================================================
                              TAB NAVIGATION
================================================================================
*/

function switchTab(tabName) {
    var tabs = document.getElementsByClassName('tab-content');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }

    var tabButtons = document.getElementsByClassName('tab');
    for (var i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove('active');
    }

    document.getElementById(tabName + 'Tab').classList.add('active');

    for (var i = 0; i < tabButtons.length; i++) {
        if (
            (tabName === 'create' && tabButtons[i].textContent.includes('Manage Playbooks')) ||
            (tabName === 'execute' && tabButtons[i].textContent.includes('Execute Playbooks')) ||
            (tabName === 'jobExecute' && tabButtons[i].textContent.includes('Execute Jobs')) ||
            (tabName === 'jobManage' && tabButtons[i].textContent.includes('Manage Jobs')) ||
            (tabName === 'group' && tabButtons[i].textContent.includes('Manage Groups')) ||
            (tabName === 'host' && tabButtons[i].textContent.includes('Manage Hosts')) ||
            (tabName === 'slurmReport' && tabButtons[i].textContent.includes('SLURM Reports')) ||
            (tabName === 'dashboard' && tabButtons[i].textContent.includes('Dashboard')) ||
            (tabName === 'profile' && tabButtons[i].classList.contains('tab-user')) ||
            (tabName === 'login' && tabButtons[i].classList.contains('tab-user')) ||
            (tabName === 'register' && tabButtons[i].classList.contains('tab-user'))
        ) {
            tabButtons[i].classList.add('active');
            break;
        }
    }

    loadTabData(tabName);
}

function loadTabData(tabName) {
    switch (tabName) {
        case 'execute':
            loadHosts();
            loadPlaybooks();
            break;
        case 'group':
            loadGroupsDropdown();
            loadHostsForGroup([]);
            break;
        case 'host':
            loadHostsDropdownForHostTab();
            break;
        case 'create':
            loadPlaybooks();
            break;
        case 'slurmReport':
            loadSlurmReport();
            break;
        case 'dashboard':
            loadDashboardUsers();
            break;
    }
}

/*
================================================================================
                              HOST MANAGEMENT
================================================================================
*/

function loadHosts() {
    fetch('/api/hosts')
        .then(function (response) {
            return response.json();
        })
        .then(function (hosts) {
            populateHostsDropdown(hosts);
            updateNodeCount();
        })
        .catch(function (error) {
            console.error('Error loading hosts:', error);
            document.getElementById('targetHosts').innerHTML = '<option value="">Error loading hosts</option>';
            document.getElementById('nodeCount').textContent = 'Error';
        });
}

function populateHostsDropdown(hosts) {
    var select = document.getElementById('targetHosts');
    select.innerHTML = '';

    var defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Choose target hosts...';
    select.appendChild(defaultOption);

    if (hosts.length > 0) {
        for (var i = 0; i < hosts.length; i++) {
            var option = document.createElement('option');
            option.value = hosts[i].name;
            option.textContent = hosts[i].name + ' (' + hosts[i].ip + ')';
            select.appendChild(option);
        }
        document.getElementById('nodeCount').textContent = hosts.length;
    } else {
        var noHostsOption = document.createElement('option');
        noHostsOption.value = '';
        noHostsOption.textContent = 'No hosts found in inventory';
        select.appendChild(noHostsOption);
        document.getElementById('nodeCount').textContent = '0';
    }
}

function loadHostsDropdownForHostTab() {
    fetch('/api/hosts')
        .then(response => response.json())
        .then(hosts => {
            var select = document.getElementById('hostSelect');
            select.innerHTML = '<option value="">-- New Host --</option>';
            hosts.forEach(host => {
                if (!host.name.startsWith('group:') && host.name !== 'all') {
                    var option = document.createElement('option');
                    option.value = host.name;
                    option.textContent = host.name + (host.ip ? ' (' + host.ip + ')' : '');
                    select.appendChild(option);
                }
            });
        });
}

function updateNodeCount() {
    fetch('/api/hosts')
        .then(response => response.json())
        .then(hosts => {
            var realHosts = hosts.filter(h => !h.name.startsWith('group:') && h.name !== 'all');
            document.getElementById('nodeCount').textContent = realHosts.length;
        })
        .catch(function () {
            document.getElementById('nodeCount').textContent = 'Error';
        });
}

function onHostSelectChange() {
    var hostName = document.getElementById('hostSelect').value;
    if (!hostName) {
        clearHostForm();
        document.getElementById('editHostBtn').style.display = 'none';
        document.getElementById('deleteHostBtn').style.display = 'none';
        document.getElementById('hostEditMode').style.display = 'none';
        document.getElementById('hostCreatorTitle').textContent = 'Manage Hosts';
        return;
    }

    fetch('/api/hosts')
        .then(response => response.json())
        .then(hosts => {
            var host = hosts.find(h => h.name === hostName);
            if (host) {
                document.getElementById('hostName').value = host.name;
                document.getElementById('hostIP').value = host.ip || '';
                document.getElementById('hostUser').value = host.user || '';
                document.getElementById('hostConnection').value = host.connection || '';
                document.getElementById('editHostBtn').style.display = 'inline-block';
                document.getElementById('deleteHostBtn').style.display = 'inline-block';
                document.getElementById('hostEditMode').style.display = 'flex';
                document.getElementById('hostCreatorTitle').textContent = 'Edit Host: ' + host.name;
            }
        });
}

function saveHost() {
    var name = document.getElementById('hostName').value.trim();
    var ip = document.getElementById('hostIP').value.trim();
    var user = document.getElementById('hostUser').value.trim();
    var connection = document.getElementById('hostConnection').value.trim();

    if (!name || !ip) {
        alert('Please enter both host name and IP address!');
        return;
    }

    fetch('/api/create-host', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                ip,
                user,
                connection
            })
        })
        .then(response => response.json())
        .then(result => {
            alert(result.message || result.error);
            loadHostsDropdownForHostTab();
            loadHosts();
            clearHostForm();
        });
}

function editSelectedHost() {
    var name = document.getElementById('hostName').value.trim();
    var ip = document.getElementById('hostIP').value.trim();
    var user = document.getElementById('hostUser').value.trim();
    var connection = document.getElementById('hostConnection').value.trim();
    var selectedHost = document.getElementById('hostSelect').value;

    if (!selectedHost || !name || !ip) {
        alert('Please select a host and enter both name and IP!');
        return;
    }

    fetch('/api/delete-host', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: selectedHost
            })
        })
        .then(response => response.json())
        .then(result => {
            fetch('/api/create-host', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name,
                        ip,
                        user,
                        connection
                    })
                })
                .then(response => response.json())
                .then(result => {
                    alert(result.message || result.error);
                    loadHostsDropdownForHostTab();
                    loadHosts();
                    clearHostForm();
                });
        });
}

function deleteSelectedHost() {
    var selectedHost = document.getElementById('hostSelect').value;
    if (!selectedHost) return alert('Select a host!');
    if (!confirm('Are you sure you want to delete host "' + selectedHost + '"?')) return;

    fetch('/api/delete-host', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: selectedHost
            })
        })
        .then(response => response.json())
        .then(result => {
            alert(result.message || result.error);
            loadHostsDropdownForHostTab();
            loadHosts();
            clearHostForm();
        });
}

function clearHostForm() {
    document.getElementById('hostName').value = '';
    document.getElementById('hostIP').value = '';
    document.getElementById('hostUser').value = '';
    document.getElementById('hostConnection').value = '';
    document.getElementById('hostSelect').value = '';
    document.getElementById('editHostBtn').style.display = 'none';
    document.getElementById('deleteHostBtn').style.display = 'none';
    document.getElementById('hostEditMode').style.display = 'none';
    document.getElementById('hostCreatorTitle').textContent = 'Manage Hosts';
}

/*
================================================================================
                              GROUP MANAGEMENT
================================================================================
*/

function loadGroupsDropdown() {
    fetch('/api/hosts')
        .then(response => response.json())
        .then(hosts => {
            var select = document.getElementById('groupSelect');
            select.innerHTML = '<option value="">-- New Group --</option>';
            hosts.forEach(host => {
                if (host.name.startsWith('group:')) {
                    var groupName = host.name.replace('group:', '');
                    var option = document.createElement('option');
                    option.value = groupName;
                    option.textContent = groupName;
                    select.appendChild(option);
                }
            });
        });
}

function onGroupSelectChange() {
    var groupName = document.getElementById('groupSelect').value;
    if (!groupName) {
        clearGroupForm();
        document.getElementById('editGroupBtn').style.display = 'none';
        document.getElementById('deleteGroupBtn').style.display = 'none';
        document.getElementById('groupEditMode').style.display = 'none';
        document.getElementById('groupCreatorTitle').textContent = 'Manage Groups';
        loadHostsForGroup([]);
        return;
    }

    document.getElementById('groupName').value = groupName;
    document.getElementById('editGroupBtn').style.display = 'inline-block';
    document.getElementById('deleteGroupBtn').style.display = 'inline-block';
    document.getElementById('groupEditMode').style.display = 'flex';
    document.getElementById('groupCreatorTitle').textContent = 'Edit Group: ' + groupName;

    fetch('/api/hosts')
        .then(response => response.json())
        .then(hosts => {
            var members = hosts
                .filter(h => h.groups && h.groups.includes(groupName) && !h.name.startsWith('group:') && h.name !== 'all')
                .map(h => h.name);
            loadHostsForGroup(members);
        });
}

function loadHostsForGroup(selectedMembers = []) {
    fetch('/api/hosts')
        .then(response => response.json())
        .then(hosts => {
            var container = document.getElementById('groupHostsCheckboxes');
            container.innerHTML = '';
            hosts.forEach(host => {
                if (host.name !== 'all' && !host.name.startsWith('group:')) {
                    var label = document.createElement('label');
                    label.style.display = 'block';
                    var checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = host.name;
                    checkbox.dataset.ip = host.ip || '';
                    checkbox.dataset.user = host.user || '';
                    checkbox.dataset.connection = host.connection || '';
                    checkbox.checked = selectedMembers.includes(host.name);
                    label.appendChild(checkbox);
                    label.appendChild(document.createTextNode(' ' + host.name + (host.ip ? ' (' + host.ip + ')' : '')));
                    container.appendChild(label);
                }
            });
        });
}

function saveGroup() {
    var groupName = document.getElementById('groupName').value.trim();
    var checkboxes = document.querySelectorAll('#groupHostsCheckboxes input[type="checkbox"]:checked');
    var hosts = [];
    checkboxes.forEach(cb => {
        hosts.push({
            name: cb.value,
            ip: cb.dataset.ip || '',
            user: cb.dataset.user || '',
            connection: cb.dataset.connection || ''
        });
    });

    if (!groupName || hosts.length === 0) {
        alert('Please enter a group name and select at least one host!');
        return;
    }

    fetch('/api/create-group', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                group_name: groupName,
                hosts: hosts
            })
        })
        .then(response => response.json())
        .then(result => {
            alert(result.message || result.error);
            loadGroupsDropdown();
            loadHostsForGroup([]);
            clearGroupForm();
        });
}

function editSelectedGroup() {
    var groupName = document.getElementById('groupName').value.trim();
    var checkboxes = document.querySelectorAll('#groupHostsCheckboxes input[type="checkbox"]:checked');
    var hosts = [];
    checkboxes.forEach(cb => {
        hosts.push({
            name: cb.value,
            ip: cb.dataset.ip || '',
            user: cb.dataset.user || '',
            connection: cb.dataset.connection || ''
        });
    });

    if (!groupName || hosts.length === 0) {
        alert('Please enter a group name and select at least one host!');
        return;
    }

    fetch('/api/delete-group', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                group_name: groupName
            })
        })
        .then(response => response.json())
        .then(result => {
            fetch('/api/create-group', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        group_name: groupName,
                        hosts: hosts
                    })
                })
                .then(response => response.json())
                .then(result => {
                    alert(result.message || result.error);
                    loadGroupsDropdown();
                    loadHostsForGroup([]);
                    clearGroupForm();
                });
        });
}

function deleteSelectedGroup() {
    var groupName = document.getElementById('groupSelect').value;
    if (!groupName) return alert('Select a group!');
    if (!confirm('Are you sure you want to delete group "' + groupName + '"?')) return;

    fetch('/api/delete-group', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                group_name: groupName
            })
        })
        .then(response => response.json())
        .then(result => {
            alert(result.message || result.error);
            loadGroupsDropdown();
            loadHostsForGroup([]);
            clearGroupForm();
        });
}

function clearGroupForm() {
    document.getElementById('groupName').value = '';
    var checkboxes = document.querySelectorAll('#groupHostsCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    document.getElementById('groupSelect').value = '';
    document.getElementById('editGroupBtn').style.display = 'none';
    document.getElementById('deleteGroupBtn').style.display = 'none';
    document.getElementById('groupEditMode').style.display = 'none';
    document.getElementById('groupCreatorTitle').textContent = 'Manage Groups';
}

/*
================================================================================
                            PLAYBOOK MANAGEMENT
================================================================================
*/

function loadPlaybooks() {
    fetch('/api/playbooks')
        .then(function (response) {
            return response.json();
        })
        .then(function (playbooks) {
            populatePlaybooksDropdown(playbooks);
        })
        .catch(function (error) {
            console.error('Error loading playbooks:', error);
            document.getElementById('playbooks').innerHTML = '<option value="">Error loading playbooks</option>';
        });
}

function populatePlaybooksDropdown(playbooks) {
    var select = document.getElementById('playbooks');
    select.innerHTML = '';

    var defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Choose playbook...';
    select.appendChild(defaultOption);

    if (playbooks.length > 0) {
        for (var i = 0; i < playbooks.length; i++) {
            var option = document.createElement('option');
            option.value = playbooks[i].filename;
            option.textContent = playbooks[i].filename + ' - ' + playbooks[i].name;
            select.appendChild(option);
        }
    } else {
        var noPlaybooksOption = document.createElement('option');
        noPlaybooksOption.value = '';
        noPlaybooksOption.textContent = 'No playbooks found';
        select.appendChild(noPlaybooksOption);
    }
}

function executePlaybook() {
    var targetHosts = document.getElementById('targetHosts').value;
    var playbook = document.getElementById('playbooks').value;
    if (!targetHosts || !playbook) {
        alert('Please select both target hosts and a playbook');
        return;
    }

    updateStatus('Executing...', '#ffc107');
    document.getElementById('systemStatus').textContent = 'Ansible Busy';

    var outputContent = document.getElementById('outputContent');
    outputContent.innerHTML = 'Starting execution of ' + playbook + ' on ' + targetHosts + '...\n';

    fetch('/api/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                hosts: targetHosts,
                playbook: playbook
            })
        })
        .then(function (response) {
            return response.json();
        })
        .then(function (result) {
            if (result.success) {
                outputContent.innerHTML += result.output;
                updateStatus('Completed Successfully', '#28a745');
            } else {
                outputContent.innerHTML += 'Error: ' + result.error + '\n' + (result.output || '');
                updateStatus('Failed', '#dc3545');
            }
        })
        .catch(function (error) {
            outputContent.innerHTML += 'Network Error: ' + error.message + '\n';
            updateStatus('Error', '#dc3545');
        })
        .finally(function () {
            document.getElementById('systemStatus').textContent = 'Ansible Available';
        });
}

function editSelectedPlaybook() {
    var selectedPlaybook = document.getElementById('playbooks').value;

    if (!selectedPlaybook) {
        alert('Please select a playbook to edit');
        return;
    }

    updateStatus('Loading playbook for editing...', '#ffc107');

    fetch('/api/get-playbook/' + selectedPlaybook)
        .then(function (response) {
            return response.json();
        })
        .then(function (result) {
            if (result.success) {
                switchTab('create');

                document.getElementById('playbookCreatorSection').style.display = 'block';
                document.getElementById('playbookDropdownSection').style.display = 'none';

                isEditMode = true;
                originalFilename = result.filename;

                document.getElementById('creatorTitle').textContent = 'Edit Playbook: ' + result.name;
                document.getElementById('editMode').style.display = 'flex';
                document.getElementById('savePlaybookBtn').textContent = 'Update Playbook';
                document.getElementById('cancelEditBtn').style.display = 'inline-block';
                document.getElementById('deletePlaybookBtn').style.display = 'inline-block';

                document.getElementById('playbookName').value = result.name.replace('.yml', '').replace('.yaml', '');
                document.getElementById('playbookDescription').value = result.description || '';
                document.getElementById('playbookContent').value = result.content;

                updateStatus('Playbook loaded for editing', '#28a745');
                document.getElementById('outputContent').innerHTML = 'Editing playbook: ' + result.filename + '\n';
            } else {
                updateStatus('Failed to load playbook', '#dc3545');
                document.getElementById('outputContent').innerHTML = 'Error loading playbook: ' + result.error + '\n';
            }
        })
        .catch(function (error) {
            updateStatus('Error', '#dc3545');
            document.getElementById('outputContent').innerHTML = 'Network error: ' + error.message + '\n';
        });
}

function savePlaybook() {
    var name = document.getElementById('playbookName').value.trim();
    var description = document.getElementById('playbookDescription').value.trim();
    var content = document.getElementById('playbookContent').value.trim();

    if (!name || !content) {
        alert('Please provide both playbook name and content');
        return;
    }

    if (isEditMode) {
        updatePlaybook(name, description, content);
    } else {
        createNewPlaybook(name, description, content);
    }
}

function createNewPlaybook(name, description, content) {
    updateStatus('Saving playbook...', '#ffc107');
    fetch('/api/save-playbook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                description,
                content
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                document.getElementById('playbookManageOutput').innerHTML =
                    `<div class="message-success">Playbook saved successfully: ${result.filename}<br>Path: ${result.path}</div>`;
                document.getElementById('playbookManageStatus').textContent = 'Playbook Saved';
                updateStatus('Playbook Saved', '#28a745');
                loadPlaybooks();
                clearCreatorForm();

                setTimeout(() => {
                    switchTab('execute');
                }, 500);
            } else {
                document.getElementById('playbookManageOutput').innerHTML =
                    `<div class="message-error">Error saving playbook: ${result.error}</div>`;
                document.getElementById('playbookManageStatus').textContent = 'Save Failed';
                updateStatus('Save Failed', '#dc3545');
            }
        })
        .catch(function (error) {
            document.getElementById('playbookManageOutput').innerHTML = 'Network Error: ' + error.message + '\n';
            document.getElementById('playbookManageStatus').textContent = 'Error';
            updateStatus('Error', '#dc3545');
        });
}

function updatePlaybook(name, description, content) {
    updateStatus('Updating playbook...', '#ffc107');
    fetch('/api/update-playbook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                original_filename: originalFilename,
                name: name,
                description: description,
                content: content
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                document.getElementById('playbookManageOutput').innerHTML =
                    `Playbook updated successfully: ${result.filename}<br>Path: ${result.path}`;
                document.getElementById('playbookManageStatus').textContent = 'Playbook Updated';
                updateStatus('Playbook Updated', '#28a745');
                loadPlaybooks();
                cancelEdit();

                setTimeout(() => {
                    switchTab('execute');
                }, 500);
            } else {
                document.getElementById('playbookManageOutput').innerHTML =
                    `Error updating playbook: ${result.error}`;
                document.getElementById('playbookManageStatus').textContent = 'Update Failed';
                updateStatus('Update Failed', '#dc3545');
            }
        })
        .catch(function (error) {
            document.getElementById('playbookManageOutput').innerHTML = 'Network Error: ' + error.message + '\n';
            document.getElementById('playbookManageStatus').textContent = 'Error';
            updateStatus('Error', '#dc3545');
        });
}

function deletePlaybook() {
    if (!isEditMode || !originalFilename) {
        alert('No playbook selected for deletion');
        return;
    }
    var confirmDelete = confirm('Are you sure you want to delete the playbook "' + originalFilename + '"?\n\nThis action cannot be undone!');
    if (!confirmDelete) return;
    updateStatus('Deleting playbook...', '#dc3545');
    fetch('/api/delete-playbook/' + originalFilename, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                document.getElementById('playbookManageOutput').innerHTML =
                    `Playbook deleted successfully: ${result.filename}`;
                document.getElementById('playbookManageStatus').textContent = 'Playbook Deleted';
                updateStatus('Playbook Deleted', '#dc3545');
                loadPlaybooks();
                cancelEdit();

                setTimeout(() => {
                    switchTab('execute');
                }, 500);
            } else {
                document.getElementById('playbookManageOutput').innerHTML =
                    `Error deleting playbook: ${result.error}`;
                document.getElementById('playbookManageStatus').textContent = 'Delete Failed';
                updateStatus('Delete Failed', '#dc3545');
            }
        })
        .catch(function (error) {
            document.getElementById('playbookManageOutput').innerHTML = 'Network Error: ' + error.message + '\n';
            document.getElementById('playbookManageStatus').textContent = 'Error';
            updateStatus('Error', '#dc3545');
        });
}

function cancelEdit() {
    isEditMode = false;
    originalFilename = '';
    document.getElementById('creatorTitle').textContent = 'Create New Playbook';
    document.getElementById('editMode').style.display = 'none';
    document.getElementById('playbookName').disabled = false;
    document.getElementById('savePlaybookBtn').textContent = 'Save Playbook';
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.getElementById('deletePlaybookBtn').style.display = 'none';
    clearCreatorForm();
    document.getElementById('playbookManageStatus').textContent = 'Edit cancelled';
    document.getElementById('playbookManageOutput').innerHTML = 'Edit mode cancelled. Ready for new operations.\n';
    updateStatus('Edit cancelled', '#6c757d');

    switchTab('execute');
}

function loadPlaybooksDropdownForEdit() {
    fetch('/api/playbooks')
        .then(r => r.json())
        .then(playbooks => {
            var select = document.getElementById('playbooksDropdown');
            select.innerHTML = '';
            playbooks.forEach(pb => {
                var opt = document.createElement('option');
                opt.value = pb.filename;
                opt.textContent = pb.filename;
                select.appendChild(opt);
            });
        });
}

function loadPlaybookForEdit(filename) {
    fetch('/api/get-playbook/' + filename)
        .then(r => r.json())
        .then(result => {
            if (result.success) {
                document.getElementById('playbookCreatorSection').style.display = 'block';
                document.getElementById('playbookDropdownSection').style.display = 'none';

                isEditMode = true;
                originalFilename = result.filename;

                document.getElementById('creatorTitle').textContent = 'Edit Playbook: ' + result.name;
                document.getElementById('editMode').style.display = 'flex';
                document.getElementById('savePlaybookBtn').textContent = 'Update Playbook';
                document.getElementById('cancelEditBtn').style.display = 'inline-block';
                document.getElementById('deletePlaybookBtn').style.display = 'inline-block';

                document.getElementById('playbookName').value = result.name.replace('.yml', '').replace('.yaml', '');
                document.getElementById('playbookDescription').value = result.description || '';
                document.getElementById('playbookContent').value = result.content;
            } else {
                alert('Error loading playbook: ' + result.error);
            }
        });
}

/*
================================================================================
                              JOB MANAGEMENT
================================================================================
*/

function loadJobs() {
    fetch('/api/jobs')
        .then(response => response.json())
        .then(jobs => {
            populateJobsDropdown(jobs);
        })
        .catch(error => {
            document.getElementById('jobs').innerHTML = '<option value="">Error loading jobs</option>';
        });
}

function populateJobsDropdown(jobs) {
    var select = document.getElementById('jobs');
    select.innerHTML = '';
    var defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Choose job...';
    select.appendChild(defaultOption);

    if (jobs.length > 0) {
        jobs.forEach(job => {
            var option = document.createElement('option');
            option.value = job.filename;
            option.textContent = job.filename + ' - ' + job.name;
            select.appendChild(option);
        });
    } else {
        var noJobsOption = document.createElement('option');
        noJobsOption.value = '';
        noJobsOption.textContent = 'No jobs found';
        select.appendChild(noJobsOption);
    }
}

function loadJobHosts() {
    fetch('/api/hosts')
        .then(function (response) {
            return response.json();
        })
        .then(function (hosts) {
            populateJobHostsDropdown(hosts);
        })
        .catch(function (error) {
            document.getElementById('jobTargetHosts').innerHTML = '<option value="">Error loading hosts</option>';
        });
}

function populateJobHostsDropdown(hosts) {
    var select = document.getElementById('jobTargetHosts');
    select.innerHTML = '';

    var defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Choose target hosts...';
    select.appendChild(defaultOption);

    if (hosts.length > 0) {
        for (var i = 0; i < hosts.length; i++) {
            var option = document.createElement('option');
            option.value = hosts[i].name;
            option.textContent = hosts[i].name + ' (' + hosts[i].ip + ')';
            select.appendChild(option);
        }
    } else {
        var noHostsOption = document.createElement('option');
        noHostsOption.value = '';
        noHostsOption.textContent = 'No hosts found in inventory';
        select.appendChild(noHostsOption);
    }
}

function executeJob() {
    var job = document.getElementById('jobs').value;
    var targetHosts = document.getElementById('jobTargetHosts').value;
    var selectedApps = getSelectedApplications();

    if (!job || !targetHosts) {
        alert('Please select both job and target hosts');
        return;
    }

    updateJobStatus('Executing...', '#ffc107');
    document.getElementById('jobExecutionStatus').textContent = 'Slurm Busy';

    var outputContent = document.getElementById('jobOutputContent');
    outputContent.innerHTML = 'Starting execution of ' + job + ' on ' + targetHosts + '...\n';

    fetch('/api/execute-job', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                job: job,
                hosts: targetHosts,
              applications: selectedApps
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                outputContent.innerHTML += result.output;

                const jobIdMatch = result.output.match(/Submitted batch job (\d+)/);
                if (jobIdMatch && jobIdMatch[1]) {
                    const jobId = jobIdMatch[1];
                    setTimeout(() => fetchJobOutput(jobId), 5000);
                }

                updateJobStatus('Completed Successfully', '#28a745');
            } else {
                outputContent.innerHTML += 'Error: ' + result.error + '\n' + (result.output || '');
                updateJobStatus('Failed', '#dc3545');
            }
        })
        .catch(error => {
            outputContent.innerHTML += 'Network Error: ' + error.message + '\n';
            updateJobStatus('Error', '#dc3545');
        })
        .finally(function () {
            document.getElementById('jobExecutionStatus').textContent = 'Ready';
        });
}

function getSelectedApplications() {
    const selected = document.querySelectorAll('#applicationsList .app-item.selected');
    return Array.from(selected).map(item => JSON.parse(item.dataset.appConfig));
}

function fetchJobOutput(jobId) {
    const outputContent = document.getElementById('jobOutputContent');
    
    if (!jobId) {
        jobId = prompt("Please enter the job ID number to check:");
        if (!jobId) return;
    }
    
    outputContent.innerHTML += `\nFetching output for job ${jobId}...\n`;

    fetch(`/api/job-output/${jobId}`)
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                outputContent.innerHTML += `\n====== SACCT JOB INFO ======\n<pre>${result.sacct_output}</pre>\n====== END SACCT JOB INFO ======\n`;
            } else {
                outputContent.innerHTML += `\nError fetching job information: ${result.error}\n`;

                if (result.error && result.error.includes("still be in queue or running")) {
                    outputContent.innerHTML += `
                        <div class="job-output-actions">
                            <button onclick="fetchJobOutput('${jobId}')" class="warning">
                                Try Again (Job might still be running)
                            </button>
                        </div>`;
                }
            }
        })
        .catch(error => {
            outputContent.innerHTML += `\nNetwork error fetching job information: ${error.message}\n`;
        });
}

function editSelectedJob() {
    var selectedJob = document.getElementById('jobs').value;
    if (!selectedJob) {
        alert('Please select a job to edit');
        return;
    }

    updateJobStatus('Loading job for editing...', '#ffc107');

    fetch('/api/get-job/' + selectedJob)
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                switchTab('jobManage');
                
                document.getElementById('jobCreatorSection').style.display = 'block';
                document.getElementById('jobDropdownSection').style.display = 'none';
                
                window.isJobEditMode = true;
                window.originalJobFilename = result.filename;

                document.getElementById('jobCreatorTitle').textContent = 'Edit Job: ' + result.name;
                document.getElementById('jobEditMode').style.display = 'flex';
                document.getElementById('jobName').disabled = true;
                document.getElementById('saveJobBtn').textContent = 'Update Job';
                document.getElementById('cancelJobEditBtn').style.display = 'inline-block';
                document.getElementById('deleteJobBtn').style.display = 'inline-block';

                document.getElementById('jobName').value = result.name.replace('.yml', '').replace('.yaml', '');
                document.getElementById('jobDescription').value = result.description || '';
                document.getElementById('jobContent').value = result.content;

                updateJobStatus('Job loaded for editing', '#28a745');
                document.getElementById('jobOutputContent').innerHTML = 'Editing job: ' + result.filename + '\n';
            } else {
                updateJobStatus('Failed to load job', '#dc3545');
                document.getElementById('jobOutputContent').innerHTML = `<div class="message-error">Error loading job: ${result.error}</div>`;
            }
        })
        .catch(error => {
            updateJobStatus('Error', '#dc3545');
            document.getElementById('jobOutputContent').innerHTML = `<div class="message-error">Network error: ${error.message}</div>`;
        });
}

function saveJob() {
    var name = document.getElementById('jobName').value.trim();
    var description = document.getElementById('jobDescription').value.trim();
    var content = document.getElementById('jobContent').value.trim();

    if (!name || !content) {
        alert('Please provide both job name and content');
        return;
    }

    if (window.isJobEditMode) {
        updateJob(name, description, content);
    } else {
        createNewJob(name, description, content);
    }
}

function createNewJob(name, description, content) {
    updateJobStatus('Saving job...', '#ffc107');
    fetch('/api/save-job', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                description,
                content
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                document.getElementById('jobManageOutput').innerHTML =
                    `<div class="message-success">Job saved successfully: ${result.filename}<br>Path: ${result.path}</div>`;
                document.getElementById('jobManageStatus').textContent = 'Job Saved';
                updateJobStatus('Job Saved', '#28a745');
                loadJobs();
                clearJobForm();

                setTimeout(() => {
                    switchTab('jobExecute');
                }, 500);
            } else {
                document.getElementById('jobManageOutput').innerHTML =
                    `<div class="message-error">Error saving job: ${result.error}</div>`;
                document.getElementById('jobManageStatus').textContent = 'Save Failed';
                updateJobStatus('Save Failed', '#dc3545');
            }
        })
        .catch(error => {
            document.getElementById('jobManageOutput').innerHTML = `<div class="message-error">Network Error: ${error.message}</div>`;
            document.getElementById('jobManageStatus').textContent = 'Error';
            updateJobStatus('Error', '#dc3545');
        });
}


function updateJob(name, description, content) {
    updateJobStatus('Updating job...', '#ffc107');
    fetch('/api/update-job', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                original_filename: window.originalJobFilename,
                name,
                description,
                content
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                document.getElementById('jobManageOutput').innerHTML =
                    `<div class="message-success">Job updated successfully: ${result.filename}<br>Path: ${result.path}</div>`;
                document.getElementById('jobManageStatus').textContent = 'Job Updated';
                updateJobStatus('Job Updated', '#28a745');
                loadJobs();
                cancelJobEdit();

                setTimeout(() => {
                    switchTab('jobExecute');
                }, 500);
            } else {
                document.getElementById('jobManageOutput').innerHTML =
                    `<div class="message-error">Error updating job: ${result.error}</div>`;
                document.getElementById('jobManageStatus').textContent = 'Update Failed';
                updateJobStatus('Update Failed', '#dc3545');
            }
        })
        .catch(error => {
            document.getElementById('jobManageOutput').innerHTML = `<div class="message-error">Network Error: ${error.message}</div>`;
            document.getElementById('jobManageStatus').textContent = 'Error';
            updateJobStatus('Error', '#dc3545');
        });
}

function deleteJob() {
    if (!window.isJobEditMode || !window.originalJobFilename) {
        alert('No job selected for deletion');
        return;
    }
    var confirmDelete = confirm('Are you sure you want to delete the job "' + window.originalJobFilename + '"?\n\nThis action cannot be undone!');
    if (!confirmDelete) return;
    updateJobStatus('Deleting job...', '#dc3545');
    fetch('/api/delete-job/' + window.originalJobFilename, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                document.getElementById('jobManageOutput').innerHTML =
                    `<div class="message-success">Job deleted successfully: ${result.filename}</div>`;
                document.getElementById('jobManageStatus').textContent = 'Job Deleted';
                updateJobStatus('Job Deleted', '#dc3545');
                loadJobs();
                cancelJobEdit();

                setTimeout(() => {
                    switchTab('jobExecute');
                }, 500);
            } else {
                document.getElementById('jobManageOutput').innerHTML =
                    `<div class="message-error">Error deleting job: ${result.error}</div>`;
                document.getElementById('jobManageStatus').textContent = 'Delete Failed';
                updateJobStatus('Delete Failed', '#dc3545');
            }
        })
        .catch(error => {
            document.getElementById('jobManageOutput').innerHTML = `<div class="message-error">Network Error: ${error.message}</div>`;
            document.getElementById('jobManageStatus').textContent = 'Error';
            updateJobStatus('Error', '#dc3545');
        });
}

function cancelJobEdit() {
    clearJobForm();
    document.getElementById('jobManageStatus').textContent = 'Edit cancelled';
    document.getElementById('jobManageOutput').innerHTML = 'Edit mode cancelled. Ready for new operations.\n';
    updateJobStatus('Edit cancelled', '#6c757d');

    switchTab('jobExecute');
}

function clearJobForm() {
    document.getElementById('jobName').value = '';
    document.getElementById('jobDescription').value = '';
    document.getElementById('jobContent').value = '';
    window.isJobEditMode = false;
    window.originalJobFilename = '';
    document.getElementById('jobCreatorTitle').textContent = 'Create New Job';
    document.getElementById('jobEditMode').style.display = 'none';
    document.getElementById('jobName').disabled = false;
    document.getElementById('saveJobBtn').textContent = 'Save Job';
    document.getElementById('cancelJobEditBtn').style.display = 'none';
    document.getElementById('deleteJobBtn').style.display = 'none';
}

function clearJobOutput() {
    document.getElementById('jobOutputContent').innerHTML = '<div class="placeholder-text">Output cleared. Ready for new execution...</div>';
    updateJobStatus('Ready', '#28a745');
}

function refreshJobs() {
    loadJobs();
    loadJobHosts();
    document.getElementById('jobOutputContent').innerHTML =
        `<div class="message-success">Jobs refreshed successfully.</div>`;
}

function loadJobsDropdownForEdit() {
    fetch('/api/jobs')
        .then(r => r.json())
        .then(jobs => {
            var select = document.getElementById('jobsDropdown');
            select.innerHTML = '';
            jobs.forEach(job => {
                var opt = document.createElement('option');
                opt.value = job.filename;
                opt.textContent = job.filename;
                select.appendChild(opt);
            });
        });
}

function loadJobForEdit(filename) {
    fetch('/api/get-job/' + filename)
        .then(r => r.json())
        .then(result => {
            if (result.success) {
                document.getElementById('jobCreatorSection').style.display = 'block';
                document.getElementById('jobDropdownSection').style.display = 'none';

                window.isJobEditMode = true;
                window.originalJobFilename = result.filename;

                document.getElementById('jobCreatorTitle').textContent = 'Edit Job: ' + result.name;
                document.getElementById('jobEditMode').style.display = 'flex';
                document.getElementById('jobName').disabled = true;
                document.getElementById('saveJobBtn').textContent = 'Update Job';
                document.getElementById('cancelJobEditBtn').style.display = 'inline-block';
                document.getElementById('deleteJobBtn').style.display = 'inline-block';

                document.getElementById('jobName').value = result.name.replace('.sh', '').replace('.slurm', '');
                document.getElementById('jobDescription').value = result.description || '';
                document.getElementById('jobContent').value = result.content;
            } else {
                alert('Error loading job: ' + result.error);
            }
        });
}

/*
================================================================================
                              ADMIN DASHBOARD
================================================================================
*/

function loadDashboardUsers() {
    fetch('/api/users')
        .then(r => r.json())
        .then(res => {
            const output = document.getElementById('dashboardUsersOutput');
            if (!res.success) {
                output.innerHTML = `<div class="message-error">${res.error}</div>`;
                return;
            }
            if (res.users.length === 0) {
                output.innerHTML = `<div class="placeholder-text">No users found.</div>`;
                return;
            }
            let html = '<table class="dashboard-users-table"><thead><tr><th>Username</th><th>Email</th><th>Full Name</th><th>Role</th><th>Actions</th></tr></thead><tbody>';
            res.users.forEach(u => {
                html += `<tr>
                    <td>${u.username}</td>
                    <td>${u.email}</td>
                    <td>${u.full_name}</td>
                    <td>${u.role}</td>
                    <td style="display:flex; gap:8px;">
        <button class="dashboard-edit-btn" data-id="${u.id}">Edit</button>
        <button class="dashboard-delete-btn" data-id="${u.id}">Delete</button>
    </td>
                </tr>`;
            });
            html += '</tbody></table>';
            output.innerHTML = html;

            document.querySelectorAll('.dashboard-edit-btn').forEach(btn => {
                btn.onclick = function () {
                    const userId = btn.getAttribute('data-id');
                    const user = res.users.find(u => u.id == userId);
                    showDashboardUserForm(user);
                };
            });
            document.querySelectorAll('.dashboard-delete-btn').forEach(btn => {
                btn.onclick = function () {
                    const userId = btn.getAttribute('data-id');
                    if (confirm('Delete user?')) {
                        deleteDashboardUser(userId);
                    }
                };
            });
        });
}

function showDashboardUserForm(user = null) {
    document.getElementById('dashboardUsersSection').style.display = 'none';
    document.getElementById('dashboardUserFormSection').style.display = 'block';
    document.getElementById('dashboardUserFormTitle').textContent = user ? 'Edit User' : 'Create User';
    document.getElementById('dashboardUserId').value = user ? user.id : '';
    document.getElementById('dashboardUsername').value = user ? user.username : '';
    document.getElementById('dashboardEmail').value = user ? user.email : '';
    document.getElementById('dashboardFullName').value = user ? user.full_name : '';
    document.getElementById('dashboardPassword').value = '';
    document.getElementById('dashboardRole').value = user ? user.role : 'user';
    document.getElementById('dashboardUserFormResult').innerHTML = '';

    loadDashboardApplications(user ? user.applications : []);
}

function loadDashboardApplications(selectedAppIds = []) {
    fetch('/api/applications')
        .then(r => r.json())
        .then(apps => {
            const appsList = document.getElementById('dashboardApplicationsList');
            if (!appsList) return;

            appsList.innerHTML = '';
            apps.forEach(app => {
                const div = document.createElement('div');
                div.className = 'app-item';
                if (selectedAppIds && selectedAppIds.includes(app.type || app.app_id)) {
                    div.classList.add('selected');
                }
                div.textContent = app.name;
                div.dataset.appId = app.type || app.app_id;
                div.onclick = function () {
                    this.classList.toggle('selected');
                };
                appsList.appendChild(div);
            });
        });
}

function hideDashboardUserForm() {
    document.getElementById('dashboardUsersSection').style.display = 'block';
    document.getElementById('dashboardUserFormSection').style.display = 'none';
    document.getElementById('dashboardUserFormResult').innerHTML = '';
}

function saveDashboardUser() {
    const id = document.getElementById('dashboardUserId').value;
    const username = document.getElementById('dashboardUsername').value.trim();
    const email = document.getElementById('dashboardEmail').value.trim();
    const full_name = document.getElementById('dashboardFullName').value.trim();
    const password = document.getElementById('dashboardPassword').value;
    const role = document.getElementById('dashboardRole').value;

    const applications = Array.from(
        document.querySelectorAll('#dashboardApplicationsList .app-item.selected')
    ).map(div => div.dataset.appId);

    if (!username || !email || !full_name || (!id && !password)) {
        document.getElementById('dashboardUserFormResult').innerHTML =
            `<div class="message-error">All fields are required (password required for new user).</div>`;
        return;
    }

    const payload = {
        username,
        email,
        full_name,
        role,
        applications
    };

    if (password) payload.password = password;
    if (id) payload.id = id;

    showSpinner();
    fetch(id ? '/api/update-user' : '/api/create-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(res => {
            hideSpinner();
            if (res.success) {
                document.getElementById('dashboardUserFormResult').innerHTML =
                    `<div class="message-success">${res.message}</div>`;
                setTimeout(() => {
                    hideDashboardUserForm();
                    loadDashboardUsers();
                }, 700);
            } else {
                document.getElementById('dashboardUserFormResult').innerHTML =
                    `<div class="message-error">${res.error}</div>`;
            }
        })
        .catch(() => {
            hideSpinner();
            document.getElementById('dashboardUserFormResult').innerHTML =
                `<div class="message-error">Network error. Please try again.</div>`;
        });
}

function deleteDashboardUser(userId) {
    const currentUserId = window.currentUser ? window.currentUser.id : null;
    const isSelfDelete = (currentUserId == userId);

    showSpinner();
    fetch('/api/delete-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: userId
            })
        })
        .then(r => r.json())
        .then(res => {
            hideSpinner();
            if (res.success) {
                if (isSelfDelete) {
                    alert('V-ați șters propriul cont. Veți fi deconectat automat.');
                    window.location.href = '/?logout=true';
                    fetch('/api/logout', {
                        method: 'POST'
                    });
                } else {
                    loadDashboardUsers();
                }
            } else {
                alert(res.error);
            }
        })
        .catch(() => {
            hideSpinner();
            alert('Network error. Please try again.');
        });
}

/*
================================================================================
                              SLURM REPORTS
================================================================================
*/

function setupSlurmReportEvents() {
    const filterBtn = document.getElementById('slurmReportFilterBtn');
    if (filterBtn) {
        filterBtn.onclick = function () {
            loadSlurmReport();
        };
    }
    const resetBtn = document.getElementById('slurmReportResetBtn');
    if (resetBtn) {
        resetBtn.onclick = function () {
            document.getElementById('slurmUserFilter').value = '';
            document.getElementById('slurmStateFilter').value = '';
            document.getElementById('slurmStartFilter').value = '';
            document.getElementById('slurmEndFilter').value = '';
            loadSlurmReport();
        };
    }
}

function loadSlurmReport() {
    const user = document.getElementById('slurmUserFilter').value.trim();
    const state = document.getElementById('slurmStateFilter').value.trim();
    const startVal = document.getElementById('slurmStartFilter').value;
    const endVal = document.getElementById('slurmEndFilter').value;

    function dateToEpoch(dateStr, startOfDay = true) {
        const parts = (dateStr || '').split('-');
        if (parts.length !== 3) return null;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dt = startOfDay ? new Date(y, m, d, 0, 0, 0, 0) : new Date(y, m, d, 23, 59, 59, 999);
        return Math.floor(dt.getTime() / 1000);
    }

    let url = '/api/slurm-report?';
    if (user) url += `user=${encodeURIComponent(user)}&`;
    if (state) url += `state=${encodeURIComponent(state)}&`;

    const startTs = startVal ? dateToEpoch(startVal, true) : null;
    const endTs = endVal ? dateToEpoch(endVal, false) : null;
    if (startTs !== null) url += `start=${encodeURIComponent(startTs)}&`;
    if (endTs !== null) url += `end=${encodeURIComponent(endTs)}&`;

    fetch(url)
        .then(r => r.json())
        .then(res => {
            const output = document.getElementById('slurmReportOutput');
            if (!res.success || !res.jobs || res.jobs.length === 0) {
                output.innerHTML = `<div class="placeholder-text">No jobs found for selected filters.</div>`;
                return;
            }
            let html = `<table class="slurm-report-table"><thead>
                <tr>
                    <th>JobID</th>
                    <th>User</th>
                    <th>Job Name</th>
                    <th>Partition</th>
                    <th>Status</th>
                    <th>Submit</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Nodes</th>
                    <th>Nodelist</th>
                    <th>CPUs</th>
                    <th>Memory</th>
                    <th>Timelimit</th>
                    <th>Elapsed</th>
                    <th>Priority</th>
                    <th>Work Dir</th>
                </tr></thead><tbody>`;
            res.jobs.forEach(job => {
                let stateClass = '';
                if (job.state) {
                    if (String(job.state).toLowerCase().includes('comp')) stateClass = 'job-state-completed';
                    else if (String(job.state).toLowerCase().includes('fail')) stateClass = 'job-state-failed';
                    else if (String(job.state).toLowerCase().includes('run')) stateClass = 'job-state-running';
                }
                html += `<tr>
                    <td>${job.jobid}</td>
                    <td>${job.user}</td>
                    <td>${job.job_name || ''}</td>
                    <td>${job.partition || ''}</td>
                    <td class="${stateClass}">${job.state || ''}</td>
                    <td>${formatTimestamp(job.time_submit)}</td>
                    <td>${formatTimestamp(job.time_start)}</td>
                    <td>${formatTimestamp(job.time_end)}</td>
                    <td>${job.nodes_alloc || ''}</td>
                    <td>${job.nodelist || ''}</td>
                    <td>${job.cpus_req || ''}</td>
                    <td>${job.mem_req ? job.mem_req + ' MB' : ''}</td>
                    <td>${formatMinutes(job.timelimit)}</td>
                    <td>${formatSeconds(job.elapsed)}</td>
                    <td>${job.priority || ''}</td>
                    <td>${job.work_dir || ''}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            output.innerHTML = html;
        })
        .catch(() => {
            document.getElementById('slurmReportOutput').innerHTML =
                `<div class="message-error">Error loading SLURM report.</div>`;
        });
}

/*
================================================================================
                              UTILITY FUNCTIONS
================================================================================
*/

function updateStatus(text, color) {
    var statusElement = document.getElementById('executionStatus');
    statusElement.textContent = text;
    statusElement.style.color = color;
}

function updateJobStatus(text, color) {
    var statusElement = document.getElementById('jobExecutionStatus');
    statusElement.textContent = text;
    statusElement.style.color = color;
}

function clearOutput() {
    document.getElementById('outputContent').innerHTML = '<div class="placeholder-text">Output cleared. Ready for new execution...</div>';
    updateStatus('Ready', '#28a745');
}

function refreshLists() {
    loadHosts();
    loadPlaybooks();
    loadHostsDropdownForHostTab();
    document.getElementById('outputContent').innerHTML = 'Lists refreshed successfully.\n';
}

function clearCreatorForm() {
    document.getElementById('playbookName').value = '';
    document.getElementById('playbookDescription').value = '';
    document.getElementById('playbookContent').value = window.defaultPlaybookContent || '';
    document.getElementById('creatorTitle').textContent = 'Create New Playbook';
    document.getElementById('editMode').style.display = 'none';
    document.getElementById('playbookName').disabled = false;
    document.getElementById('savePlaybookBtn').textContent = 'Save Playbook';
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.getElementById('deletePlaybookBtn').style.display = 'none';
}

function clearJobForm() {
    document.getElementById('jobName').value = '';
    document.getElementById('jobDescription').value = '';
    document.getElementById('jobContent').value = window.defaultJobContent || '';
    window.isJobEditMode = false;
    window.originalJobFilename = '';
    document.getElementById('jobCreatorTitle').textContent = 'Create New Job';
    document.getElementById('jobEditMode').style.display = 'none';
    document.getElementById('jobName').disabled = false;
    document.getElementById('saveJobBtn').textContent = 'Save Job';
    document.getElementById('cancelJobEditBtn').style.display = 'none';
    document.getElementById('deleteJobBtn').style.display = 'none';
}

function updateTabsAndButtonsByRole() {
    const isAdmin = window.currentUser && window.currentUser.role === 1;
    const isLoggedIn = !!window.currentUser;

    const allButtons = [
        'executeBtn', 'editPlaybookBtn', 'savePlaybookBtn', 'deletePlaybookBtn',
        'editGroupBtn', 'saveGroupBtn', 'deleteGroupBtn',
        'editHostBtn', 'saveHostBtn', 'deleteHostBtn',
        'editJobBtn', 'saveJobBtn', 'deleteJobBtn'
    ];

    const dashboardTabBtn = document.getElementById('dashboardTabBtn');
    if (dashboardTabBtn) {
        dashboardTabBtn.style.display = isAdmin ? '' : 'none';
    }

    const tabs = Array.from(document.getElementsByClassName('tab'));

    const slurmTabBtn = tabs.find(t => t.textContent.trim() === 'SLURM Reports');

    if (!isLoggedIn) {
        tabs.forEach(tab => {
            if (!tab.classList.contains('tab-user')) tab.classList.add('disabled');
            tab.style.display = '';
        });
        if (slurmTabBtn) slurmTabBtn.classList.add('disabled');
        allButtons.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) btn.disabled = true;
        });
        if (dashboardTabBtn) dashboardTabBtn.style.display = 'none';
        return;
    }

    if (isAdmin) {
        tabs.forEach(tab => {
            tab.classList.remove('disabled');
            tab.style.display = '';
        });
        if (slurmTabBtn) slurmTabBtn.classList.remove('disabled'), slurmTabBtn.style.display = '';
        allButtons.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) btn.disabled = false;
        });
        if (dashboardTabBtn) dashboardTabBtn.style.display = '';
        return;
    }

    const allowedForUser = ['Execute Jobs', 'Manage Jobs'];
    tabs.forEach(tab => {
        const txt = tab.textContent.trim();
        if (tab.classList.contains('tab-user') || allowedForUser.includes(txt)) {
            tab.style.display = '';
            tab.classList.remove('disabled');
        } else {
            tab.style.display = 'none';
        }
    });

    if (slurmTabBtn) slurmTabBtn.style.display = 'none';
    if (dashboardTabBtn) dashboardTabBtn.style.display = 'none';

    const restrictedBtnIds = [
        'editPlaybookBtn','savePlaybookBtn','deletePlaybookBtn',
        'editGroupBtn','saveGroupBtn','deleteGroupBtn',
        'editHostBtn','saveHostBtn','deleteHostBtn',
        'executeBtn'
    ];

    allButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.disabled = restrictedBtnIds.includes(btnId);
    });
}

function formatTimestamp(ts) {
    if (!ts || ts === 0) return '';
    return new Date(ts * 1000).toLocaleString();
}

function formatSeconds(sec) {
    if (!sec || sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}h ${m}m ${s}s`;
}

function formatMinutes(min) {
    if (!min || min <= 0) return '';
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    let out = '';
    if (d) out += `${d}d `;
    if (h) out += `${h}h `;
    if (m) out += `${m}m`;
    return out.trim();
}

function loadApplications() {
    fetch('/api/applications')
        .then(r => r.json())
        .then(apps => {
            const appsList = document.getElementById('applicationsList');
            if (!appsList) return;

            appsList.innerHTML = '';
            apps.forEach(app => {
                const div = document.createElement('div');
                div.className = 'app-item';
                div.textContent = app.name;
                div.dataset.appId = app.type;
                div.dataset.appConfig = JSON.stringify(app);
                div.onclick = function() {
                    this.classList.toggle('selected');
                };
                appsList.appendChild(div);
            });
        });
}

function getSelectedApplications() {
    const selected = document.querySelectorAll('#applicationsList .app-item.selected');
    return Array.from(selected).map(item => JSON.parse(item.dataset.appConfig));
}

(function () {
    var el = document.getElementById('defaults');
    if (el) {
        try {
            var parsed = JSON.parse(el.textContent || el.innerText || '{}');
            window.defaultPlaybookContent = parsed.playbook || '';
            window.defaultJobContent = parsed.job || '';
        } catch (e) {
            window.defaultPlaybookContent = window.defaultPlaybookContent || '';
            window.defaultJobContent = window.defaultJobContent || '';
            console.error('Failed to parse defaults JSON:', e);
        }
    } else {
        window.defaultPlaybookContent = window.defaultPlaybookContent || '';
        window.defaultJobContent = window.defaultJobContent || '';
    }

    try {
        var pbEl = document.getElementById('playbookContent');
        if (pbEl && (!pbEl.value || pbEl.value.trim() === '')) pbEl.value = window.defaultPlaybookContent || '';

        var jobEl = document.getElementById('jobContent');
        if (jobEl && (!jobEl.value || jobEl.value.trim() === '')) jobEl.value = window.defaultJobContent || '';
    } catch (e) {
        console.error('Error populating default editor content:', e);
    }
})();