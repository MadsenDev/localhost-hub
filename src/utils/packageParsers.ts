export interface ParsedVulnerability {
  package: string;
  versionRange: string;
  severity: string;
  description: string;
  advisoryUrl?: string;
  fixAvailable: string;
  fixCommand?: string;
  dependencyTree: Array<{ package: string; versionRange: string; reason: string; location: string }>;
}

export interface ParsedAuditResult {
  vulnerabilities: ParsedVulnerability[];
  summary: { total: number; moderate: number; high: number; critical: number; low: number };
  recommendations: string[];
}

export interface ParsedOutdatedPackage {
  package: string;
  current: string;
  wanted: string;
  latest: string;
  location: string;
  dependedBy: string;
}

export function parseAuditOutput(output: string): ParsedAuditResult | null {
  if (!output || output.includes('found 0 vulnerabilities') || output.includes('No vulnerabilities found')) {
    return null;
  }

  const lines = output.split('\n');
  const vulnerabilities: ParsedVulnerability[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Skip header and empty lines
    if (line.startsWith('#') || !line || line === '') {
      i++;
      continue;
    }

    // Check if this is a package name line (package name followed by version range)
    const packageMatch = line.match(/^([a-zA-Z0-9@/._-]+)\s+([<=>0-9.\s-]+)$/);
    if (packageMatch) {
      const packageName = packageMatch[1];
      const versionRange = packageMatch[2].trim();
      
      // Look for severity
      i++;
      let severity = 'unknown';
      let description = '';
      let advisoryUrl = '';
      let fixAvailable = '';
      let fixCommand: string | undefined = undefined;
      const dependencyTree: Array<{ package: string; versionRange: string; reason: string; location: string }> = [];

      while (i < lines.length) {
        const currentLine = lines[i].trim();
        
        // Empty line means end of this vulnerability
        if (currentLine === '') {
          // Push the vulnerability before moving to next
          vulnerabilities.push({
            package: packageName,
            versionRange,
            severity,
            description: description || 'No description available',
            advisoryUrl: advisoryUrl || undefined,
            fixAvailable: fixAvailable || 'No fix available',
            fixCommand,
            dependencyTree
          });
          i++;
          break;
        }

        // Check for severity
        if (currentLine.startsWith('Severity:')) {
          severity = currentLine.replace('Severity:', '').trim().toLowerCase();
          i++;
          continue;
        }

        // Check for fix available (may span multiple lines)
        if (currentLine.includes('fix available')) {
          fixAvailable = currentLine;
          // Extract the command from backticks (e.g., `npm audit fix --force`)
          const commandMatch = currentLine.match(/`([^`]+)`/);
          fixCommand = commandMatch ? commandMatch[1] : undefined;
          
          // Check if there's additional info on the next line (like "Will install...")
          if (i + 1 < lines.length && lines[i + 1]?.trim() && !lines[i + 1].trim().startsWith('node_modules')) {
            fixAvailable += ' ' + lines[i + 1].trim();
            i++; // Skip the next line since we've included it
          }
          i++;
          continue;
        }

        // Check for advisory URL (usually contains github.com/advisories or similar)
        if (currentLine.includes('http') && (currentLine.includes('advisories') || currentLine.includes('GHSA'))) {
          const urlMatch = currentLine.match(/(https?:\/\/[^\s]+)/);
          if (urlMatch) {
            advisoryUrl = urlMatch[1];
          }
          // Description might be before or after the URL
          const descPart = currentLine.replace(advisoryUrl, '').trim();
          if (descPart && !descPart.includes('http')) {
            description = descPart || description;
          }
          i++;
          continue;
        }
        
        // Description might be on a line by itself (before the URL)
        if (description === '' && currentLine && !currentLine.startsWith('node_modules') && 
            !currentLine.startsWith('fix available') && !currentLine.startsWith('Severity:') &&
            !currentLine.startsWith('  ') && !currentLine.includes('http') && 
            !currentLine.match(/^[a-zA-Z0-9@/._-]+\s+[<=>0-9.\s-]+$/)) {
          description = currentLine;
          i++;
          continue;
        }

        // Check for dependency tree entries (indented lines)
        if (currentLine.startsWith('  ') || currentLine.startsWith('    ')) {
          const depMatch = currentLine.match(/^(\s+)([a-zA-Z0-9@/._-]+)\s+([<=>0-9.\s-|]+)/);
          if (depMatch) {
            const depPackage = depMatch[2];
            const depVersion = depMatch[3].trim();
            const reason = lines[i + 1]?.trim() || '';
            const location = lines.find((l, idx) => idx > i && l.includes('node_modules') && l.includes(depPackage))?.trim() || '';
            
            dependencyTree.push({
              package: depPackage,
              versionRange: depVersion,
              reason: reason.startsWith('Depends on') ? reason : '',
              location: location
            });
          }
          i++;
          continue;
        }

        i++;
      }
      
      // If we didn't hit an empty line, push the vulnerability now
      if (packageName) {
        vulnerabilities.push({
          package: packageName,
          versionRange,
          severity,
          description: description || 'No description available',
          advisoryUrl: advisoryUrl || undefined,
          fixAvailable: fixAvailable || 'No fix available',
          fixCommand,
          dependencyTree
        });
      }
    } else {
      i++;
    }
  }

  // Parse summary
  const summaryLine = lines.find(l => l.includes('vulnerabilities') && /\d/.test(l));
  let summary = { total: 0, moderate: 0, high: 0, critical: 0, low: 0 };
  if (summaryLine) {
    const totalMatch = summaryLine.match(/(\d+)\s+vulnerabilities/);
    if (totalMatch) summary.total = parseInt(totalMatch[1], 10);
    
    const moderateMatch = summaryLine.match(/(\d+)\s+moderate/);
    if (moderateMatch) summary.moderate = parseInt(moderateMatch[1], 10);
    
    const highMatch = summaryLine.match(/(\d+)\s+high/);
    if (highMatch) summary.high = parseInt(highMatch[1], 10);
    
    const criticalMatch = summaryLine.match(/(\d+)\s+critical/);
    if (criticalMatch) summary.critical = parseInt(criticalMatch[1], 10);
    
    const lowMatch = summaryLine.match(/(\d+)\s+low/);
    if (lowMatch) summary.low = parseInt(lowMatch[1], 10);
  }

  // Extract recommendations (capture full text including commands)
  const recommendations: string[] = [];
  const recStart = lines.findIndex(l => l.includes('To address'));
  if (recStart !== -1) {
    let currentRec = '';
    for (let j = recStart; j < lines.length; j++) {
      const recLine = lines[j].trim();
      if (recLine && recLine.startsWith('To')) {
        // If we have a previous recommendation, save it
        if (currentRec) {
          recommendations.push(currentRec.trim());
        }
        currentRec = recLine;
      } else if (currentRec && recLine && !recLine.startsWith('#') && recLine !== '') {
        // Continue building the current recommendation
        currentRec += ' ' + recLine;
      } else if (currentRec && recLine === '') {
        // Empty line after recommendation, save it
        recommendations.push(currentRec.trim());
        currentRec = '';
      }
    }
    // Don't forget the last one
    if (currentRec) {
      recommendations.push(currentRec.trim());
    }
  }

  return vulnerabilities.length > 0 ? { vulnerabilities, summary, recommendations } : null;
}

export function parseOutdatedOutput(output: string): ParsedOutdatedPackage[] | null {
  if (!output || output.includes('No outdated packages') || output.includes('All packages are up to date')) {
    return null;
  }

  const lines = output.split('\n').filter(line => line.trim());
  if (lines.length < 2) return null;

  // Find the header line (usually contains "Package", "Current", "Wanted", "Latest")
  const headerIndex = lines.findIndex(line => 
    line.includes('Package') && (line.includes('Current') || line.includes('Wanted') || line.includes('Latest'))
  );
  
  if (headerIndex === -1) return null;

  // Skip header and separator lines, then parse data rows
  const dataLines = lines.slice(headerIndex + 1).filter(line => {
    const trimmed = line.trim();
    // Skip separator lines (dashes) and empty lines
    return trimmed && !trimmed.match(/^[-=]+$/);
  });

  const packages: ParsedOutdatedPackage[] = [];

  for (const line of dataLines) {
    // Parse the line - format is typically:
    // Package       Current  Wanted  Latest  Location                   Depended by
    // @types/react   19.2.5  19.2.7  19.2.7  node_modules/@types/react  localhost-hub
    
    // Split by multiple spaces to get columns
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length >= 4) {
      packages.push({
        package: parts[0]?.trim() || '',
        current: parts[1]?.trim() || '',
        wanted: parts[2]?.trim() || '',
        latest: parts[3]?.trim() || '',
        location: parts[4]?.trim() || '',
        dependedBy: parts[5]?.trim() || ''
      });
    }
  }

  return packages.length > 0 ? packages : null;
}

