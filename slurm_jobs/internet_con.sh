#!/bin/bash
#SBATCH --job-name=net_check
#SBATCH --output=ping_%j.out
#SBATCH --nodes=2
#SBATCH --ntasks-per-node=1

srun ping -c 4 google.com
