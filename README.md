# onewordgame — labeled-gaussian-game-generator

This repository hosts the **labeled-gaussian-game-generator** [Cursor Agent Skill](https://cursor.com/docs/context/skills).

The skill generates playable games from a user-provided image and a one-sentence game request by calling a Gaussian-generation API, building a semantic scene graph from labels, and binding game mechanics to labeled objects.

## Layout

```
.cursor/skills/labeled-gaussian-game-generator/
├── SKILL.md
├── recipes/
├── schemas/
├── scripts/
├── validators/
├── references/
├── templates/
└── test-results/
```

## Using the skill locally

Copy or symlink this folder to your user skills directory, or open this repo as a workspace so Cursor loads the project skill from `.cursor/skills/`.

## Secrets

Do not commit API keys. Configure `GAUSSIAN_API_URL` and `GAUSSIAN_API_KEY` (or project config) via environment variables only.

## License

See repository owner for licensing terms.
