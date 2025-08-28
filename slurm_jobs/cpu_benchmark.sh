#!/bin/bash
#SBATCH --job-name=cpu_benchmark
#SBATCH --output=cpu_bench_%j.out
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --time=5:00

echo "Starting CPU benchmark..."
python3 -c "
import time
start = time.time()
sum(x*x for x in range(10**7))
print(f'CPU benchmark done in {time.time() - start:.2f} seconds')
"
