#!/bin/bash
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --partition=debug
#SBATCH --output=/tmp/slurm-test.out

echo "Hello from Slurm on $(hostname)!"
