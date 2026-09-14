.DEFAULT_GOAL := help

COMPOSE := docker compose
RSYNC_DEV := /Users/cftang0827/workspaces/dot-files/rsync-tool/rsync-dev
REMOTE := cu
REMOTE_DIR := /home/cftang0827/workspaces/tra-timetable
PREVIEW_CONTAINER := tra-timetable-preview

.PHONY: help dev down logs build check data ja-labels sync preview preview-logs preview-stop deploy-pages

help: ## Show available commands.
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Build then serve the complete static site at http://localhost:5173/.
	$(COMPOSE) up

down: ## Stop the local Docker Compose services.
	$(COMPOSE) down

logs: ## Follow local application logs.
	$(COMPOSE) logs -f app

build: ## Build the production static site in Docker.
	$(COMPOSE) run --rm app npm run build

check: ## Check station-region data integrity in Docker.
	$(COMPOSE) run --rm app npm run check:stations

data: ## Download and preprocess the latest timetable data in Docker.
	$(COMPOSE) run --rm app npm run download

ja-labels: ## Update Japanese station labels and regenerate station regions in Docker.
	$(COMPOSE) run --rm app sh -lc 'node tools/update-ja-station-labels.mjs && npm run generate:station-regions && npm run check:stations'

sync: ## Sync the working tree to the CU development server.
	$(RSYNC_DEV) push

preview: sync ## Rebuild and restart the CU Docker preview on port 5173.
	ssh $(REMOTE) 'docker rm -f $(PREVIEW_CONTAINER) >/dev/null 2>&1 || true; cd $(REMOTE_DIR) && docker compose run -d --name $(PREVIEW_CONTAINER) --service-ports app sh -lc "npm ci && npm run build && npm run preview -- --host 0.0.0.0 --port 5173"'

preview-logs: ## Follow the CU preview build and server logs.
	ssh $(REMOTE) 'docker logs -f $(PREVIEW_CONTAINER)'

preview-stop: ## Stop the CU preview container.
	ssh $(REMOTE) 'docker rm -f $(PREVIEW_CONTAINER)'

deploy-pages: build check ## Verify the production artifact; GitHub Pages deploys after you push the commit.
	@printf '%s\n' 'Checks passed. Commit and push the changes to trigger the GitHub Pages workflow.'
