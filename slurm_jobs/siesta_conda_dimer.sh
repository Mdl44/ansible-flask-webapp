#!/bin/bash
#SBATCH --job-name=dimer_conda_job
#SBATCH --output=dimer_conda_job.out
#SBATCH --error=dimer_conda_job.err
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --time=01:00:00

eval "$(/mnt/nfsshare/miniforge3/condabin/conda shell.bash hook)"
conda activate siestaenv


cd /mnt/nfsshare/fisiere-test/siesta-fisiere/02-WaterDimer/

srun siesta < dimer.fdf > dimer.out

RESULTS_DIR=/mnt/nfsshare/fisiere-test/siesta-fisiere/02-WaterDimer/results_${SLURM_JOB_ID}
mkdir -p "$RESULTS_DIR"
cp dimer.* "$RESULTS_DIR"/
