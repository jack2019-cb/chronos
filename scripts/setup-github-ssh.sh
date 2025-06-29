#!/bin/zsh
# Script to set up SSH config for two GitHub accounts: work and consultant
# Work key: id_ed25519_projectlead (already exists)
# Consultant key: id_ed25519_consultant (will be generated if not present)

WORK_KEY="$HOME/.ssh/id_ed25519_projectlead"
CONSULTANT_KEY="$HOME/.ssh/id_ed25519_consultant"
CONSULTANT_EMAIL="ros_will-marie@yahoo.com"  # Change this to your consultant GitHub email

# Generate consultant key if it does not exist
if [ ! -f "$CONSULTANT_KEY" ]; then
  echo "Generating new SSH key for consultant account..."
  ssh-keygen -t ed25519 -C "$CONSULTANT_EMAIL" -f "$CONSULTANT_KEY" -N ""
  echo "Consultant SSH key generated: $CONSULTANT_KEY"
else
  echo "Consultant SSH key already exists: $CONSULTANT_KEY"
fi

# Add SSH config entries if not already present
if ! grep -q "Host github-work" "$HOME/.ssh/config" 2>/dev/null; then
  cat <<EOF >> $HOME/.ssh/config

# GitHub Work Account
Host github-work
    HostName github.com
    User git
    IdentityFile $WORK_KEY
    IdentitiesOnly yes
EOF
  echo "Added github-work to SSH config."
else
  echo "github-work already in SSH config."
fi

if ! grep -q "Host github-consultant" "$HOME/.ssh/config" 2>/dev/null; then
  cat <<EOF >> $HOME/.ssh/config

# GitHub Consultant Account
Host github-consultant
    HostName github.com
    User git
    IdentityFile $CONSULTANT_KEY
    IdentitiesOnly yes
EOF
  echo "Added github-consultant to SSH config."
else
  echo "github-consultant already in SSH config."
fi

echo "\nSetup complete!"
echo "Add the following public keys to the correct GitHub accounts if not already done:"
echo "  Work:        $WORK_KEY.pub"
echo "  Consultant:  $CONSULTANT_KEY.pub"
echo "\nTo clone using a specific account, use:"
echo "  git clone git@github-work:org/repo.git        # for work"
echo "  git clone git@github-consultant:org/repo.git  # for consultant"
