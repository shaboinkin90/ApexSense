#!/bin/zsh

# Shell script for setting up required libraries to run ApexSense from the source code
# This was written for macOS in mind
#
# Reason for this script: 
#   Someone on my youtube video commented that they have an Intel Macbook and cannot use the pre-built Apple Silicon macOS binary
#   I suggested to follow the readme on how to setup up their system to run from he source code but they were not well-versed 
#   in terminal commands. This is an attempt at streamlining that process.

apexsense_version="1.0.1"

echo "🏎️  ApexSense ${apexsense_version} development environment quick setup.\n"

xcode-select -p &>/dev/null
if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️ Xcode command line tools are not installed ⚠️"
    echo ""
    echo "A window will appear asking to install these tools."
    echo "These tools are required to run ApexSense from the source code."
    echo "Click on Install, accept Apple's license agreement, and run ApexSense Setup again after installation completes."
    xcode-select --install
    echo "You can click on the 'Quit' button to dismiss this message." 
else 
    apexsense_output=$HOME/ApexSense-${apexsense_version}

    if [ -f "${apexsense_output}/package.json" ]; then
        echo "Launching ApexSense from the source code..."
        cd ${apexsense_output}
        source ~/.zshrc
        npm start
        exit 0
    fi

    echo "ApexSense source files will be saved in ${apexsense_output}\n\n"

    # Python setup
    # `xcode-select --install` will install a valid instance of python
    # Invoking python3 before installing the xcode cli tools will trigger 
    # a UI prompt to inform the end-user to install them
    py_version=$(python3 --version)
    if [[ $py_version == *"No developer tools"* ]]; then
        echo "Ensure you have Xcode Command Line Tools installed"
        xcode-select --install
        exit -1
    else
        echo "Found $(python3 --version)."
        numpy_installed=false
        opencv_installed=false

        if python3 -c "import numpy" 2>/dev/null; then numpy_installed=true; fi
        if python3 -c "import cv2" 2>/dev/null; then opencv_installed=true; fi

        if ! $numpy_installed || ! $opencv_installed; then
            echo "Installing numpy, opencv-python..."
            pip3 install numpy opencv-python --quiet &>/dev/null
        fi
    fi

    # Node.js install
    if ! command -v npm; then
        echo "Installing Node.js"
        touch ~/.zshrc
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh &>/dev/null | bash &>/dev/null
        source ~/.zshrc
        nvm install node &>/dev/null
    fi

    # ApexSense source code setup
    apexsense_zip_output=/tmp/ApexSense-${apexsense_version}.zip
    echo "Downloading ApexSense v${apexsense_version} source code to ${apexsense_zip_output}"
    curl -L "https://github.com/shaboinkin90/ApexSense/archive/refs/tags/v${apexsense_version}.zip" -o ${apexsense_zip_output} &>/dev/null
    unzip -q ${apexsense_zip_output} -d $HOME
    rm ${apexsense_zip_output}

    echo "Downloading dependencies for ApexSense..."
    cd ${apexsense_output}
    npm install &>/dev/null

    npm start

    echo "Setup Complete ✅"
fi