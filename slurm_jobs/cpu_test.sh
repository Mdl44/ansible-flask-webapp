#!/bin/bash
echo "Testing CPU usage"
echo "Task ID: $SLURM_PROCID"
echo "Number of tasks: $SLURM_NTASKS"

for i in {1..1000}; do
    result=$((i*i))
done

echo "CPU test completeed for task $SLURM_PROCID"
