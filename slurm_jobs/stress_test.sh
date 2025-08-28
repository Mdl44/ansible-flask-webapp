#!/bin/bash
#SBATCH --job-name=io_stress
#SBATCH --output=io_stress_%j.out
#SBATCH --ntasks=1
#SBATCH --time=5:00

echo "Simulating I/O-heavy workload..."
python3 -c "
with open('io_test.txt', 'w') as f:
    for i in range(1000000):
        f.write(f'{i} - Some text here\\n')
with open('io_test.txt', 'r') as f:
    lines = f.readlines()
print(f'Read {len(lines)} lines')
"
rm -f io_test.txt
