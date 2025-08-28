#!/bin/bash
#SBATCH --job-name=siesta_waterdimer
#SBATCH --output=siesta_waterdimer.out
#SBATCH --error=siesta_waterdimer.err
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --time=02:00:00

# 1. Setup scratch dir (fallback if SLURM_TMPDIR is not set)
SCRATCH=${SLURM_TMPDIR:-/tmp/$USER/$SLURM_JOB_ID}
mkdir -p "$SCRATCH"

# 2. Copy needed input files: .fdf and all .psf pseudopotentials
cp /mnt/nfsshare/fisiere-test/siesta-fisiere/02-WaterDimer/dimer.fdf "$SCRATCH"/
cp /mnt/nfsshare/fisiere-test/siesta-fisiere/02-WaterDimer/*.psml "$SCRATCH"/



# 3. Go into scratch
cd "$SCRATCH" || exit 1

# 4. Run Siesta
srun /mnt/nfsshare/opt/siesta/bin/siesta < dimer.fdf > dimer.out

# 5. Save results back to NFS
RESULTS_DIR=/mnt/nfsshare/fisiere-test/siesta-fisiere/02-WaterDimer/results_${SLURM_JOB_ID}
mkdir -p "$RESULTS_DIR"

# Copy only files, not directories
find . -maxdepth 1 -type f -exec cp {} "$RESULTS_DIR" \;

