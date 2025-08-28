#!/bin/bash
#SBATCH --job-name=hello_world
#SBATCH --output=hello_%j.out
#SBATCH --error=hello_%j.out
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=1
#SBATCH --mem=100M

echo "Hello from SLURM!"
echo "Job ID: $SLURM_JOB_ID"
echo "Node: $SLURMD_NODENAME"
echo "Date: $(date)"
sleep 10
echo "Job completed!"
