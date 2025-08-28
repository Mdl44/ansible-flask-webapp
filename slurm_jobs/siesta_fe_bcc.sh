#!/bin/bash
#SBATCH --job-name=siesta_fe_bcc
#SBATCH --output=siesta_fe_bcc.out
#SBATCH --error=siesta_fe_bcc.err
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --time=02:00:00

# 1. Setup scratch dir (fallback if SLURM_TMPDIR is not set)
SCRATCH=${SLURM_TMPDIR:-/tmp/$USER/$SLURM_JOB_ID}
mkdir -p "$SCRATCH"

# 2. Copy needed input files: .fdf and all .psf pseudopotentials
cp /mnt/nfsshare/fisiere-test/siesta-fisiere/01_Fe_bcc/fe_bcc.fdf "$SCRATCH"/
cp /mnt/nfsshare/fisiere-test/siesta-fisiere/01_Fe_bcc/*.psf "$SCRATCH"/

# 3. Go into scratch
cd "$SCRATCH" || exit 1

# 4. Run Siesta
srun /mnt/nfsshare/opt/siesta/bin/siesta < fe_bcc.fdf > fe_bcc.out

# 5. Save results back to NFS
RESULTS_DIR=/mnt/nfsshare/fisiere-test/siesta-fisiere/01_Fe_bcc/results_${SLURM_JOB_ID}
mkdir -p "$RESULTS_DIR"

# Copy only files, not directories
find . -maxdepth 1 -type f -exec cp {} "$RESULTS_DIR" \;

