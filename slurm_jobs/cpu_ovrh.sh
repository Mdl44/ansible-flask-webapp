#!/bin/bash
#SBATCH --job-name=cpu_temp
#SBATCH --output=cpu_temp.out
#SBATCH --time=00:01:00

sensors  # Requires lm_sensors
