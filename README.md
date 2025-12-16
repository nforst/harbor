# Harbor ⚓

A lightweight macOS local development tool that runs web projects without VMs or containers. It auto-sets local domains with trusted HTTPS certificates and can proxy services to custom URLs.

Harbor is inspired by [Laravel Valet](https://laravel.com/docs/valet) but built with modern TypeScript and designed to be framework-agnostic.

## Features

- 🚀 **Zero configuration** - Just link your project and go
- 🔒 **Trusted HTTPS** - Automatic SSL certificates for all local domains
- 🌐 **Custom domains** - Use `.test`, `.local`, or any TLD you prefer
- 🔄 **Proxy support** - Forward domains to any local service (Node, Docker, etc.)
- 🐘 **PHP switching** - Easily switch between PHP versions
- ⚡ **Lightweight** - No VMs, no containers, just native macOS tools

## Requirements

- macOS
- [Homebrew](https://brew.sh/)
- Node.js 18+

## Installation

```bash
brew tap nforst/tools
brew install nforst/tools/harbor
harbor install
```

The `harbor install` command sets up:
- Caddy (web server with automatic HTTPS)
- dnsmasq (local DNS resolver)
- PHP-FPM (optional, for PHP projects)

## Commands

### `harbor install`

Sets up Harbor and all required dependencies (Caddy, dnsmasq, PHP).

```bash
harbor install
```

### `harbor uninstall`

Removes Harbor and cleans up all configurations.

```bash
harbor uninstall
```

### `harbor link [domain]`

Links the current directory to a local domain. If a `public/` subdirectory with an `index.php` exists, it will be used as the document root.

You can specify just the domain name (uses the default TLD) or include a custom TLD.

```bash
# Link current folder as myapp.test (uses folder name + default TLD)
cd ~/Projects/myapp
harbor link

# Link with a custom domain name (uses default TLD, e.g. myapp.test)
harbor link myapp

# Link with a custom TLD (uses .dev instead of default .test)
harbor link myapp.dev
```

### `harbor unlink [domain]`

Removes a linked domain.

```bash
# Unlink current folder
harbor unlink

# Unlink a specific domain
harbor unlink myapp
```

### `harbor sites`

Lists all linked sites and proxies.

```bash
harbor sites
```

### `harbor proxy <domain> <host>`

Proxies a domain to a local service. Perfect for Node.js apps, Docker containers, or any other service.

```bash
# Proxy frontend.test to localhost:3000
harbor proxy frontend localhost:3000

# Proxy api.test to a Docker container
harbor proxy api localhost:8080

# Proxy with a custom TLD (uses .dev instead of default .test)
harbor proxy frontend.dev localhost:3000
```

### `harbor unproxy <domain>`

Removes a proxy.

```bash
harbor unproxy frontend
```

### `harbor tld <tld>`

Changes the default TLD for new domains. You can optionally migrate existing sites to the new TLD.

```bash
# Change default TLD to .dev
harbor tld dev
```

### `harbor php`

Interactive PHP version switcher. Lists all installed PHP versions and lets you choose which one to use.

```bash
harbor php
```

To install additional PHP versions:

```bash
brew install php@8.1
brew install php@8.2
brew install php@8.3
```

## How It Works

Harbor uses a combination of native macOS tools:

1. **Caddy** - A modern web server that automatically provisions and renews local SSL certificates
2. **dnsmasq** - Resolves all `.test` (or your chosen TLD) domains to `127.0.0.1`
3. **PHP-FPM** - Handles PHP requests for your projects

All configuration is stored in `~/.config/harbor/`.

## Uninstallation

Before uninstalling via Homebrew, run:

```bash
harbor uninstall
```

Then remove the package:

```bash
brew uninstall nforst/tools/harbor
brew untap nforst/tools
```

## License

ISC © [Niklas Forst](https://github.com/nforst)
