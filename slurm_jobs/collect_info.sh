#!/bin/bash
#SBATCH --job-name=collect_info
#SBATCH --output=/root/info_%x_%a.out
#SBATCH --partition=debug
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --array=11,12

# Mapare array task id la numele nodului
if [ "$SLURM_ARRAY_TASK_ID" = "11" ]; then
    NODE=flex1-11
elif [ "$SLURM_ARRAY_TASK_ID" = "12" ]; then
    NODE=flex1-12
else
    echo "Nod necunoscut"
    exit 1
fi

# Executăm comenzi pe nodul țintă
ssh $NODE bash -c "'
echo \"Hostname: \$(hostname)\"
echo \"Memorie:\"
free -h
echo \"CPU info:\"
lscpu
'" > /root/info${SLURM_ARRAY_TASK_ID}.out
