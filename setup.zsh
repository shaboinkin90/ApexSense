#!/bin/zsh

# Shell script for setting up required libraries to run ApexSense from the source code
# This was written for macOS in mind
#
# Reason for this script: 
#   Someone on my youtube video commented that they have an Intel Macbook and cannot use the pre-built Apple Silicon macOS binary
#   I suggested to follow the readme on how to setup up their system to run from he source code but they were not well-versed 
#   in terminal commands. This is an attempt at streamlining that process.
#   Platypus is used to to package up the script into an .app bundle

apexsense_version="1.0.1"

apexsense_output=$HOME/ApexSense-${apexsense_version}

###### Functions ######
launch_apexsense_if_ready() {
    if [ -f "${apexsense_output}/package.json" ]; then
        echo "Launching ApexSense from the source code..."
        cd ${apexsense_output}
        source ~/.zshrc
        npm start
        exit 0
    fi
}

check_for_xcode_cli_tools() {
    xcode-select -p &>/dev/null
    if [ $? -ne 0 ]; then
        echo ""
        echo "⚠️ Xcode command line tools are not installed ⚠️"
        echo ""
        $(xcode-select --install) &
        echo ""
        echo "A window will appear asking to install these tools."
        echo "These tools are required to run ApexSense from the source code."
        echo ""
        echo "Click on Install, accept Apple's license agreement, then wait for the software to download and install."
        echo ""
        echo "Keep this window open while the Xcode command line tools are downloading..."
        echo ""
        echo "When the download completes, click on 'Done' in the Xcode command line tools installer window to continue." 

        sleep 5

        local installer_proc_name="Install Command Line Developer Tool"
        while pgrep -f "${installer_proc_name}" > /dev/null; do
            sleep 3
        done
    fi

    if ! [ -d "/Library/Developer/CommandLineTools" ]; then
        echo "The Xcode command line developer tools did not appear to install correctly."
        echo "Exiting..."
        exit -1
    fi
}

setup_python() {
    # `xcode-select --install` will install a valid instance of python
    py_version=$(python3 --version)
    if [[ $py_version == *"No developer tools"* ]]; then
        echo "Ensure you have Xcode Command Line Tools installed."
        exit -1
    fi

    echo "Found $(python3 --version)."

    numpy_installed=false
    opencv_installed=false
    if python3 -c "import numpy" 2>/dev/null; then numpy_installed=true; fi
    if python3 -c "import cv2" 2>/dev/null; then opencv_installed=true; fi

    if ! $numpy_installed || ! $opencv_installed; then
        echo "Installing numpy, opencv-python..."
        pip3 install numpy opencv-python --quiet &>/dev/null
    fi
}

install_nvm_node() { 
    if ! command -v npm; then
        echo "Installing Node.js..."
        touch ~/.zshrc
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh &>/dev/null | bash &>/dev/null
        source ~/.zshrc
        nvm install node &>/dev/null
    fi
}

download_apexsense() {
    apexsense_zip_output=/tmp/ApexSense-${apexsense_version}.zip
    src_url="https://github.com/shaboinkin90/ApexSense/archive/refs/tags/v${apexsense_version}.zip" 
    echo "Downloading ApexSense v${apexsense_version} source code from ${src_url}"
    curl -L $src_url -o $apexsense_zip_output &>/dev/null
    unzip -q $apexsense_zip_output -d $HOME
    rm $apexsense_zip_output
}

prepare_and_launch_apexsense() {
    echo "Downloading dependencies for ApexSense..."
    cd ${apexsense_output}
    npm install &>/dev/null

    if ! [ -d $apexsense_output/node_modules ]; then
        # On testing in a virtual machine, sometimes the download would fail. Running again "works"
        npm install &>/dev/null
    fi
    npm start
}

###### Start #######

launch_apexsense_if_ready # will exit

echo "\n🏎️  ApexSense ${apexsense_version} development environment quick setup.\n"

check_for_xcode_cli_tools # can exit

echo "ApexSense source files will be saved in ${apexsense_output}"

echo "1️⃣"
setup_python # can exit

echo "2️⃣"
install_nvm_node

echo "3️⃣"
download_apexsense

echo "4️⃣"
prepare_and_launch_apexsense

echo "Setup Complete ✅"
echo ""
echo "Run ApexSense Dev Mode.app again to launch ApexSense."
