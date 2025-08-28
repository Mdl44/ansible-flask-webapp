#!/bin/bash
#SBATCH --job-name=pi_estimation
#SBATCH --output=pi_%j.out
#SBATCH --time=01:00
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4

echo "Estimating Pi using Monte Carlo on $(hostname)"

python3 << 'PYTHON'
import random
import time

N = 10_000_000
inside = 0

start = time.time()
for _ in range(N):
    x, y = random.random(), random.random()
    if x**2 + y**2 <= 1:
        inside += 1

pi_estimate = (inside / N) * 4
elapsed = time.time() - start

print(f"Estimated π: {pi_estimate}")
print(f"Elapsed time: {elapsed:.2f} seconds")
PYTHON
