#!/bin/bash
#SBATCH --job-name=test_node11
#SBATCH --output=node12.out
#SBATCH --partition=debug
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --nodelist=flex1-12

echo "Job pe $(hostname)"
sleep 5
echo "Finalizat pe flex1-12"



