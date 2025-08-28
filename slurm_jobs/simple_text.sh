#!/bin/bash
#SBATCH --job-name=simple_test
#SBATCH --output=/root/slurm_jobs/simple_test_%j.out
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=1
#SBATCH --nodes=1

echo "Hello from Slurm job"
date
sleep 10
echo "Job complete"

