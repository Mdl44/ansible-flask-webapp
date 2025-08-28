#!/bin/bash
#SBATCH --job-name=mpi_test
#SBATCH --chdir=/home/ilaria.moroianu/slurm_jobs
#SBATCH --output=/home/ilaria.moroianu/slurm_jobs/mpi_test_%j.log
#SBATCH --error=/home/ilaria.moroianu/slurm_jobs/mpi_test_%j.log
#SBATCH --ntasks=4
#SBATCH --nodes=2
#SBATCH --time=00:10:00
#SBATCH --mem=512M


cd /home/ilaria.moroianu/slurm_jobs

echo "DEBUG: Starting job $SLURM_JOB_ID on $(hostname) at $(date)"
echo "DEBUG: Working dir: $(pwd)"
echo "DEBUG: Listing files:"
ls -l

cat << 'EOF' > hello_mpi.c
#include <mpi.h>
#include <stdio.h>
int main(int argc, char** argv) {
    MPI_Init(NULL, NULL);
    int world_size;
    MPI_Comm_size(MPI_COMM_WORLD, &world_size);
    int world_rank;
    MPI_Comm_rank(MPI_COMM_WORLD, &world_rank);
    char processor_name[MPI_MAX_PROCESSOR_NAME];
    int name_len;
    MPI_Get_processor_name(processor_name, &name_len);
    printf("Hello from processor %s, rank %d of %d\n", processor_name, world_rank, world_size);
    fflush(stdout);
    MPI_Finalize();
    return 0;
}
EOF

echo "Compiling MPI program..."
mpicc -o hello_mpi hello_mpi.c

echo "Running MPI program with srun..."
srun --mpi=pmi2 ./hello_mpi

# Copiere fișiere pe head node după execuție
if [[ $(hostname) != "flex1-13" ]]; then
    scp mpi_test_* root@flex1-13:/home/ilaria.moroianu/slurm_jobs/
fi
