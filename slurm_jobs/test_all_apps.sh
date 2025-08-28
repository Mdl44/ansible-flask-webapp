#!/bin/bash
#SBATCH --job-name=test_all_apps
#SBATCH --output=test_all_apps_%j.out
#SBATCH --error=test_all_apps_%j.err
#SBATCH --ntasks=1
#SBATCH --time=00:15:00

echo "=========================================================="
echo "Job start: $(date)"
echo "User: $(whoami)"
echo "Working directory: $(pwd)"
echo "=========================================================="

# Test 1: SIESTA Native (Binary version)
echo -e "\n\033[1;32m===== Testing SIESTA (Native Binary) =====\033[0m"
echo "----------------------------------------"
if command -v run_siesta_native &>/dev/null; then
    echo "Running SIESTA binary version..."
    run_siesta_native --version
    echo "Binary path: $SIESTA_NATIVE_BIN"
else
    echo "SIESTA native binary helper function not available"
fi

# Test 2: SIESTA Conda Environment
echo -e "\n\033[1;32m===== Testing SIESTA (Conda) =====\033[0m"
echo "----------------------------------------"
if command -v run_siesta_conda &>/dev/null; then
    echo "Running SIESTA conda version..."
    run_siesta_conda siesta --version
    echo "SIESTA Conda environment details:"
    run_siesta_conda conda info | grep "active environment"
else
    echo "SIESTA conda helper function not available"
fi

# Test 3: TensorFlow
echo -e "\n\033[1;32m===== Testing TensorFlow =====\033[0m"
echo "----------------------------------------"
if command -v run_tensorflow &>/dev/null; then
    echo "Running TensorFlow test..."
    run_tensorflow python -c "import tensorflow as tf; print(f'TensorFlow version: {tf.__version__}')"
    echo "Testing GPU availability:"
    run_tensorflow python -c "import tensorflow as tf; print(f'GPU available: {tf.config.list_physical_devices(\"GPU\")}')"
    echo "TensorFlow environment details:"
    run_tensorflow conda info | grep "active environment"
else
    echo "TensorFlow helper function not available"
fi

# Display environment variables set by injection
echo -e "\n\033[1;33m===== Environment Variables =====\033[0m"
echo "----------------------------------------"
env | grep -E "APP_|CONDA_|_BIN|_PATH" | sort

echo -e "\n=========================================================="
echo "Job finished: $(date)"
echo "=========================================================="