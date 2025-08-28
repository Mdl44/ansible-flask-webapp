#!/bin/bash
#SBATCH --job-name=tfperf_job
#SBATCH --output=tfperf_job.out
#SBATCH --error=tfperf_job.err
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --time=01:00:00

eval "$(/mnt/nfsshare/miniforge3/condabin/conda shell.bash hook)"
conda activate tfperf


cd /mnt/nfsshare/fisiere-test/python-fisiere

srun python capped30sec.py
