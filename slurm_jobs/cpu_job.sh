#!/bin/bash
#SBATCH --job-name=cpu_job
#SBATCH --output=cpu_%j.out
#SBATCH --time=00:03:00
#SBATCH --nodes=1
#SBATCH --ntasks=2
#SBATCH --cpus-per-task=1

echo "Testing CPU usage"
echo "Task ID: $SLURM_PROCID"
echo "Number of tasks: $SLURM_NTASKS"

for i in {1..10000} do
    result=$((i*i))
done

echo "CPU test completed for task $SLURM_PROCID"
