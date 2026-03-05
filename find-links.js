import fs from 'fs/promises';
import path from 'path';

const VIEWS_DIR = './views';

/**
 * Recursively gets all .ejs files from a directory
 * @param {string} dir 
 * @returns {Promise<string[]>}
 */
const getEjsFiles = async (dir) => {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    const files = await Promise.all(entries.map((entry) => {
      const res = path.resolve(dir, entry.name);
      return entry.isDirectory() ? getEjsFiles(res) : res;
    }));

    return files.flat().filter(file => file.endsWith('.ejs'));
  } catch (error) {
    console.error(`[Error] Failed to read directory ${dir}:`, error.message);
    return [];
  }
};

/**
 * Extracts external links from file content using regex
 * Matches http://, https://, and protocol-relative // links
 * @param {string} content 
 * @returns {string[]}
 */
const extractExternalLinks = (content) => {
  // Regex looks for http/https/double-slash followed by non-quote/non-space characters
  const urlRegex = /(https?:\/\/|(?<="|\s|^)\/\/[a-zA-Z0-9.-]+)[^\s"'<>]+/g;
  const matches = content.match(urlRegex);
  return matches ? [...new Set(matches)] : []; // Return unique links
};

/**
 * Main execution function
 */
const start = async () => {
  console.log(`[System] Scanning directory: ${VIEWS_DIR}...`);

  const ejsFiles = await getEjsFiles(VIEWS_DIR);
  
  if (ejsFiles.length === 0) {
    console.log('[Info] No .ejs files found.');
    return;
  }

  console.log(`[Info] Found ${ejsFiles.length} EJS files. Extracting links...\n`);

  for (const file of ejsFiles) {
    try {
      const content = await fs.readFile(file, 'utf8');
      const links = extractExternalLinks(content);
      
      if (links.length > 0) {
        const relativePath = path.relative(process.cwd(), file);
        console.log(`File: ${relativePath}`);
        links.forEach(link => console.log(`  - ${link}`));
        console.log(''); // New line for readability
      }
    } catch (error) {
      console.error(`[Error] Could not read file ${file}:`, error.message);
    }
  }

  console.log('[System] Scan complete.');
};

// Execute
start();