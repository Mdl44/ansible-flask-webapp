#!/bin/bash
# Description: Simple job that creates a file with timestamp and system info
# SLURM directives
#SBATCH --job-name=create_file
#SBATCH --time=00:05:00
#SBATCH --ntasks=1
#SBATCH --mem=100M


mkdir -p $HOME/job_outputs


OUTPUT_FILE="$HOME/job_outputs/file_created_$(date +%Y%m%d_%H%M%S).txt"

# Write content to the file
echo "=== File Creation Test ===" > $OUTPUT_FILE
echo "Job ID: $SLURM_JOB_ID" >> $OUTPUT_FILE
echo "Created at: $(date)" >> $OUTPUT_FILE
echo "Hostname: $(hostname)" >> $OUTPUT_FILE
echo "Current user: $(whoami)" >> $OUTPUT_FILE
echo "System info:" >> $OUTPUT_FILE
uname -a >> $OUTPUT_FILE

# Check if file was created successfully
if [ -f "$OUTPUT_FILE" ]; then
    echo "File created successfully at: $OUTPUT_FILE"
    echo "Contents of the file:"
    cat "$OUTPUT_FILE"
else
    echo "Failed to create file at: $OUTPUT_FILE"
fi