#!/bin/bash
#SBATCH --job-name=data_analysis
#SBATCH --ntasks=1
#SBATCH --time=20:00
#SBATCH --mem=4GB
#SBATCH --output=analysis_%j.out

source /etc/profile.d/modules.sh
module load python/3.9

python3 << 'PYTHON'
import random
import statistics
import math

# Generate sample data
print("Generating random dataset...")
data = [random.gauss(50, 15) for _ in range(1000)]

# Basic statistics
mean_val = statistics.mean(data)
median_val = statistics.median(data)
std_dev = statistics.stdev(data)
min_val = min(data)
max_val = max(data)

print(f"Dataset Analysis Results:")
print(f"Sample size: {len(data)}")
print(f"Mean: {mean_val:.2f}")
print(f"Median: {median_val:.2f}")
print(f"Standard deviation: {std_dev:.2f}")
print(f"Range: {min_val:.2f} to {max_val:.2f}")

# Find outliers (values more than 2 std devs from mean)
outliers = [x for x in data if abs(x - mean_val) > 2 * std_dev]
print(f"Outliers (>2σ): {len(outliers)} values")

# Create simple histogram
bins = 10
hist_data = [0] * bins
bin_width = (max_val - min_val) / bins

for value in data:
    bin_index = min(int((value - min_val) / bin_width), bins - 1)
    hist_data[bin_index] += 1

print("\nHistogram:")
for i, count in enumerate(hist_data):
    bin_start = min_val + i * bin_width
    bin_end = bin_start + bin_width
    bar = "#" * (count // 10)
    print(f"{bin_start:6.1f}-{bin_end:6.1f}: {count:3d} {bar}")
PYTHON#!/bin/bash
#SBATCH --job-name=data_analysis
#SBATCH --ntasks=1
#SBATCH --time=20:00
#SBATCH --mem=4GB
#SBATCH --output=analysis_%j.out

module load python/3.9

python3 << 'PYTHON'
import random
import statistics
import math

# Generate sample data
print("Generating random dataset...")
data = [random.gauss(50, 15) for _ in range(1000)]

# Basic statistics
mean_val = statistics.mean(data)
median_val = statistics.median(data)
std_dev = statistics.stdev(data)
min_val = min(data)
max_val = max(data)

print(f"Dataset Analysis Results:")
print(f"Sample size: {len(data)}")
print(f"Mean: {mean_val:.2f}")
print(f"Median: {median_val:.2f}")
print(f"Standard deviation: {std_dev:.2f}")
print(f"Range: {min_val:.2f} to {max_val:.2f}")

# Find outliers (values more than 2 std devs from mean)
outliers = [x for x in data if abs(x - mean_val) > 2 * std_dev]
print(f"Outliers (>2σ): {len(outliers)} values")

# Create simple histogram
bins = 10
hist_data = [0] * bins
bin_width = (max_val - min_val) / bins

for value in data:
    bin_index = min(int((value - min_val) / bin_width), bins - 1)
    hist_data[bin_index] += 1

print("\nHistogram:")
for i, count in enumerate(hist_data):
    bin_start = min_val + i * bin_width
    bin_end = bin_start + bin_width
    bar = "#" * (count // 10)
    print(f"{bin_start:6.1f}-{bin_end:6.1f}: {count:3d} {bar}")
PYTHON
