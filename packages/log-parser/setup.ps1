# Log Parser Setup Script
# Run this to set environment variables persistently in your PowerShell session
# Or edit the values below and run it

# Set your OpenRouter API key
$env:OPENROUTER_API_KEY = "sk-or-v1-..."

# Set your logs authentication token
$env:LOG_AUTH_TOKEN = "Bearer r4JAs3ru4idQLsPIpQYcKh0YRbZG-6Phw4tLAf-nGK4="

Write-Host "✓ Environment variables set for this session" -ForegroundColor Green
Write-Host "  OPENROUTER_API_KEY: $($env:OPENROUTER_API_KEY.Substring(0, 20))..."
Write-Host "  LOG_AUTH_TOKEN: $($env:LOG_AUTH_TOKEN.Substring(0, 30))..."
