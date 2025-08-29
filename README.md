# Leaked Email Checker Chrome Extension

A Chrome extension that checks if email addresses have been involved in data breaches. This extension scans web pages for email addresses and checks them against a database of known data breaches using the Bitlion proxy service.

## Features

- 🔍 **Page Scanning**: Automatically detects email addresses on any webpage
- ⚡ **Quick Check**: Right-click context menu to check selected email addresses
- 🎯 **Visual Highlighting**: Highlights compromised emails directly on the webpage
- 💾 **Smart Caching**: Caches results for 7 days to reduce API calls
- 🔔 **Notifications**: Desktop notifications for scan results
- 🛡️ **Privacy Focused**: Uses Bitlion proxy to protect your privacy

## Screenshots

The extension provides a clean popup interface and visual highlighting of compromised emails on web pages.

## Installation

### From Source (Developer Mode)

1. **Download the Extension**
   ```bash
   git clone https://github.com/ijlik/JD_011-AdiNugroho-LeakedEmailChecker.git
   cd JD_011-AdiNugroho-LeakedEmailChecker
   ```

2. **Enable Developer Mode in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Toggle on "Developer mode" in the top right corner

3. **Load the Extension**
   - Click "Load unpacked" button
   - Select the project directory containing the `manifest.json` file
   - The extension should now appear in your extensions list

4. **Pin the Extension** (Optional)
   - Click the puzzle piece icon in the Chrome toolbar
   - Find "Leaked Email Checker" and click the pin icon to keep it visible

## Usage

### Method 1: Popup Scanner
1. Click the extension icon in the Chrome toolbar
2. Click "Scan page for emails" button
3. The extension will scan the current page for email addresses
4. Results will show which emails have been compromised

### Method 2: Context Menu
1. Select any email address on a webpage
2. Right-click and choose "Check if leaked"
3. A notification will show the result

### Method 3: Visual Highlighting
When emails are found to be compromised, they will be highlighted directly on the webpage with visual indicators.

## How It Works

1. **Email Detection**: The extension uses regular expressions to find email addresses on web pages
2. **API Integration**: Queries the Bitlion proxy service which interfaces with Have I Been Pwned (HIBP)
3. **Caching**: Results are cached locally for 7 days to improve performance
4. **Privacy**: Uses Bitlion's proxy service to protect your IP address from direct HIBP queries

## Technical Details

### Permissions Used
- `storage`: For caching API results
- `contextMenus`: For right-click functionality
- `scripting`: For content script injection
- `activeTab`: For accessing current page content
- `notifications`: For desktop notifications

### Files Structure
```
├── manifest.json          # Extension configuration
├── background.js          # Service worker for API calls
├── content_script.js      # Page scanning logic
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── result.html           # Results display page
├── styles.css            # Popup styling
├── highlight.css         # Page highlighting styles
└── icons/                # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## API Information

This extension uses the Bitlion proxy service (`https://email-check.bitlion.io/api/search`) which provides:
- Rate limiting protection
- Privacy protection (your IP is not exposed to HIBP)
- Reliable access to Have I Been Pwned data

## Development

### Requirements
- Chrome Browser (version 88+)
- Basic understanding of Chrome Extension APIs

### Local Development
1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

### Building for Production
The extension is ready to use as-is. For distribution:
1. Zip the entire project directory (excluding `.git` folder)
2. Upload to Chrome Web Store or distribute the ZIP file

## Privacy & Security

- **No Data Collection**: The extension doesn't collect or store personal information
- **Local Caching**: Results are stored locally in your browser only
- **Proxy Protection**: Uses Bitlion proxy to protect your IP address
- **Open Source**: Full source code is available for review

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions:
1. Check the [Issues](https://github.com/ijlik/JD_011-AdiNugroho-LeakedEmailChecker/issues) page
2. Create a new issue with detailed information about the problem
3. Include your Chrome version and extension version

## Acknowledgments

- [Have I Been Pwned](https://haveibeenpwned.com/) for the breach data
- [Bitlion](https://bitlion.io/) for providing the proxy service
- Chrome Extensions API documentation

---

**⚠️ Disclaimer**: This tool is for educational and security awareness purposes. Always verify results through official channels and follow responsible disclosure practices.
