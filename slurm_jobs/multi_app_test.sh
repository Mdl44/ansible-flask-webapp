#!/bin/bash
#SBATCH --job-name=app_test
#SBATCH --output=app_test_%j.out
#SBATCH --error=app_test_%j.err
#SBATCH --ntasks=1
#SBATCH --time=00:10:00
# === APPLICATION SETUP ===
# Environment variables for all configured applications
# Application: SIESTA (Native)
# Type: binary
export APP_SIESTA_NATIVE_SELECTED=1
export SIESTA_NATIVE_BIN="/mnt/nfsshare/siesta/bin/siesta"
export SIESTA_NATIVE_PATH="/mnt/nfsshare/siesta/bin"
# Application: SIESTA (Conda)
# Type: conda
export APP_SIESTA_CONDA_SELECTED=1
export CONDA_BASE="/mnt/nfsshare/miniforge3"
export CONDA_ENV_SIESTA_CONDA="siestaenv"
# Application: TensorFlow
# Type: conda
export APP_TENSORFLOW_SELECTED=1
export CONDA_BASE="/mnt/nfsshare/miniforge3"
export CONDA_ENV_TENSORFLOW="tfperf"
# === END APPLICATION SETUP ===
# === APP EXECUTION HELPERS ===
# Functions to run applications in their proper environments
function run_siesta_native() {
  "$SIESTA_NATIVE_BIN" "$@"
}

function run_siesta_conda() {
  (source "$CONDA_BASE/etc/profile.d/conda.sh" && conda activate "$CONDA_ENV_SIESTA_CONDA" && "$@")
}

function run_tensorflow() {
  (source "$CONDA_BASE/etc/profile.d/conda.sh" && conda activate "$CONDA_ENV_TENSORFLOW" && "$@")
}

# === END APP EXECUTION HELPERS ===



echo "Job start: $(date)"
echo "User: $(whoami)"
echo "Working directory: $(pwd)"
echo "-------------------------"

echo "Testing SIESTA (conda):"
echo "-------------------------"
run_siesta_conda siesta --version
echo

echo "Testing TensorFlow:"
echo "-------------------------"
run_tensorflow python -c "import tensorflow as tf; print(f'TensorFlow version: {tf.__version__}')"
echo

echo "-------------------------"
echo "Job finished: $(date)"