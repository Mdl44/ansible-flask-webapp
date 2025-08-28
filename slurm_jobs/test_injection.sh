#!/bin/bash
# Description: Test if autocomplete works
#SBATCH --job-name=test_injection
#SBATCH --output=test_injection.out
#SBATCH --error=test_injection.err
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --time=01:00:00

# This script intentionally has no application setup
# It relies on the injection system to add the proper commands
# When an application is selected in the UI

# If no application is selected, this script will do nothing useful
echo "Job started at $(date)"
echo "Without application injection, this script doesn't know what to run"
echo "Job ended at $(date)"