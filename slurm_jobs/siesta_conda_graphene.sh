#!/bin/bash
#SBATCH --job-name=graphene_conda_job
#SBATCH --output=graphene_conda_job.out
#SBATCH --error=graphene_conda_job.err
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=16
#SBATCH --time=01:00:00

eval "$(/mnt/nfsshare/miniforge3/condabin/conda shell.bash hook)"
conda activate siestaenv


cd /mnt/nfsshare/fisiere-test/siesta-fisiere/01-Graphene/

srun siesta < graphene.fdf > graphene.out

RESULTS_DIR=/mnt/nfsshare/fisiere-test/siesta-fisiere/01-Graphene/results_${SLURM_JOB_ID}
mkdir -p "$RESULTS_DIR"
cp graphene.* "$RESULTS_DIR"/
