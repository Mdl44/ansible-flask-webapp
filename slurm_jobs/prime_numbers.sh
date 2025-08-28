#!/bin/bash
#SBATCH --job-name=prime_calc
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --time=30:00
#SBATCH --mem=2GB
#SBATCH --output=primes_%j.out

echo "Finding prime numbers up to 100,000"
python3 << 'PYTHON'
def is_prime(n):
    if n < 2:
        return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    return True

primes = [n for n in range(2, 100001) if is_prime(n)]
print(f"Found {len(primes)} prime numbers")
print(f"Largest prime: {max(primes)}")
print(f"First 10 primes: {primes[:10]}")
print(f"Last 10 primes: {primes[-10:]}")
PYTHON

