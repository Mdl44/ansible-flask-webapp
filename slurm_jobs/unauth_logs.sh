#!/bin/bash
#SBATCH --job-name=login_check
#SBATCH --output=logins_%j.out
#SBATCH --ntasks=1

grep "Failed password" /var/log/auth.log | tail -n 20
