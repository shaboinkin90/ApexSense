#!/bin/zsh

# Shell script for setting up required libraries to run ApexSense from the source code
# This was written for macOS in mind
#
# Reason for this script: 
#   Someone on my youtube video commented that they have an Intel Macbook and cannot use the pre-built Apple Silicon macOS binary
#   I suggested to follow the readme on how to setup up their system to run from he source code but they were not well-versed 
#   in terminal commands. This is an attempt at streamlining that process.
#   Platypus is used to to package up the script into an .app bundle




# Extract the tag_name from the JSON response, which is the version number

apexsense_version=""
apexsense_output=""

###### Functions ######
get_latest_apexsense_version() {
    github_releases_url="https://api.github.com/repos/shaboinkin90/ApexSense/releases/latest"
    latest_release_json=$(curl -s "$github_releases_url")
    local curl_exit_status=$?
    if [[ $curl_exit_status -ne 0 ]]; then
        echo "‼️ Failed to query ${github_releases_url}. ‼️" >&2
        echo "Check your network connection or check if you can access the ApexSense repository on Github at https://github.com/shaboinkin90/ApexSense/releases/" >&2
        echo "Exiting..." >&2
        exit 1
    fi

    latest_version=$(echo "${latest_release_json}" | grep '"tag_name":' | sed -E 's/.*"tag_name": "([^"]+)".*/\1/')
    echo "$latest_version"
}

launch_apexsense_if_ready() {
    if [[ -z "$apexsense_output" ]]; then
        # problem getting the version number, maybe due to network issue querying github, see if a copy exists
        apexsense_output=$(find "${HOME}" -type d -name 'ApexSense-v*' | sort -V | tail -n 1)
        if [[ -z "$apexsense_output" ]]; then
            echo "Could not determine the latest version of ApexSense to download nor did it find an existing copy of ApexSense."
            echo "Check your network connection or check if you can access the ApexSense repository on Github at https://github.com/shaboinkin90/ApexSense/releases/"
            echo "Exiting..."
            exit 1
        fi
    fi

    if [[ -f "${apexsense_output}/package.json" ]]; then
        echo "Launching ApexSense from the source code..."
        cd "$apexsense_output"
        source ~/.zshrc
        npm start
        exit 0
    fi
}

check_for_xcode_cli_tools() {
    xcode-select -p &>/dev/null
    if [[ $? -ne 0 ]]; then
        echo ""
        echo "⚠️ Xcode command line tools are not installed ⚠️"
        echo ""
        xcode-select --install
        echo ""
        echo "A window will appear asking to install these tools."
        echo "These tools are required to run ApexSense from the source code."
        echo ""
        echo "Click on Install, accept Apple's license agreement, then wait for the software to download and install."
        echo ""
        echo "Keep this window open while the Xcode command line tools finish installing..."
        echo ""
        echo "When the installation completes, click on 'Done' in the Xcode command line tools installer window to continue." 

        local installer_proc_name="Install Command Line Developer Tool"
        while pgrep -f "${installer_proc_name}" > /dev/null; do
            sleep 3
        done
    fi

    if [[ !  -d "/Library/Developer/CommandLineTools" ]]; then
        echo "The Xcode command line developer tools did not appear to install correctly." >&2
        echo "Exiting..." >&2
        exit 1
    fi
}

setup_python() {
    # `xcode-select --install` will install a valid instance of python
    local py_version=$(python3 --version)
    if [[ $py_version == *"No developer tools"* ]]; then
        echo "Ensure you have Xcode Command Line Tools installed."
        exit 1
    fi

    echo "Found $py_version."

    local numpy_installed="false"
    local opencv_installed="false"
    if python3 -c "import numpy" 2>/dev/null; then numpy_installed="true"; fi
    if python3 -c "import cv2" 2>/dev/null; then opencv_installed="true"; fi

    if [[ $numpy_installed != "true" ]] || [[ $opencv_installed != "true" ]]; then
        echo "Installing numpy, opencv-python..."
        pip3 install numpy opencv-python --quiet &>/dev/null
    fi
}

install_nvm_node() { 
    if ! command -v npm; then
        echo "Installing Node.js..."
        touch ~/.zshrc
        curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh" &>/dev/null | bash &>/dev/null
        source ~/.zshrc
        nvm install node &>/dev/null
    fi
}

download_apexsense() {
    local temp_zip_output=$(mktemp -d)
    if [[ ! -d "$temp_zip_output" ]]; then 
        echo "Failed to create a temporary directory to store the zip." >&2
        echo "Exiting..."
        exit 1
    fi
    
    local apexsense_zip_output="${temp_zip_output}/ApexSense-${apexsense_version}.zip"
    local src_url="https://github.com/shaboinkin90/ApexSense/archive/refs/tags/${apexsense_version}.zip" 
    
    echo "Downloading ApexSense ${apexsense_version} source code from ${src_url}"
    curl -L "$src_url" -o "$apexsense_zip_output" &>/dev/null
    local curl_exit_status=$?
    if [[ $curl_exit_status -ne 0 ]]; then
        echo "‼️ Failed to download from ${src_url}. ‼️"
        echo "Check your network connection or check if you can access the ApexSense repository on Github at ${src_url}" >&2
        echo "Exiting..." >&2
        exit 1
    fi

    local temp_zip_extract=$(mktemp -d)
    if [[ ! -d "$temp_zip_extract" ]]; then 
        echo "Failed to create a temporary directory to extract the zip." >&2
        echo "Exiting..."
        exit 1
    fi

    unzip -q "$apexsense_zip_output" -d "$temp_zip_extract"
    mv "${temp_zip_extract}"/* "$apexsense_output"
    trap "rm -rf ${temp_zip_output} ${temp_zip_extract}" EXIT
}

prepare_and_launch_apexsense() {
    echo "Downloading dependencies for ApexSense...this might take a few minutes..."
    cd $apexsense_output
    npm install &>/dev/null

    if [[ ! -d "${apexsense_output}/node_modules" ]]; then
        # On testing in a virtual machine, sometimes the download would fail. Running again "works"
        npm install &>/dev/null
    fi
}

###### Start #######


apexsense_version=$(get_latest_apexsense_version)
if [[ $apexsense_version =~ v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    apexsense_output=$HOME/ApexSense-${apexsense_version}
fi

launch_apexsense_if_ready


echo "\n🏎️  ApexSense ${apexsense_version} development environment quick setup.\n"

check_for_xcode_cli_tools # can exit

echo "\n🟣 ApexSense source files will be saved in ${apexsense_output} 🟣"

echo "🔵⚪️⚪️⚪️" 
setup_python # can exit

echo "🟢🔵⚪️⚪️"
install_nvm_node

echo "🟢🟢🔵⚪️"
download_apexsense

echo "🟢🟢🟢🔵"
prepare_and_launch_apexsense

echo "🟢🟢🟢🟢"
echo "Setup Complete"

npm start

echo ""
echo "Run ApexSense Dev Mode.app again to launch ApexSense."
