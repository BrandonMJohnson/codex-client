import { defineConfig } from "vitepress";

function resolveBase(): string {
  if (process.env.DOCS_BASE_PATH) {
    return process.env.DOCS_BASE_PATH;
  }

  if (process.env.GITHUB_ACTIONS === "true") {
    const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];

    if (repositoryName) {
      return `/${repositoryName}/`;
    }
  }

  return "/";
}

export default defineConfig({
  title: "codex-app-server-client",
  description: "A typed TypeScript client for codex app-server.",
  base: resolveBase(),
  cleanUrls: true,
  lastUpdated: true,
  lang: "en-US",
  themeConfig: {
    siteTitle: "codex-app-server-client",
    nav: [
      { text: "Guide", link: "/guide/" },
      { text: "API Surface", link: "/reference/" },
      {
        text: "GitHub",
        link: "https://github.com/BrandonMJohnson/codex-client"
      }
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Overview", link: "/guide/" },
            { text: "Requirements", link: "/guide/#requirements" },
            { text: "Install", link: "/guide/#install" },
            {
              text: "Start The App-Server",
              link: "/guide/#start-the-app-server"
            },
            {
              text: "Initialize A Client",
              link: "/guide/#initialize-a-client"
            },
            {
              text: "Run Threads And Turns",
              link: "/guide/#run-threads-and-turns"
            },
            { text: "Stream Events", link: "/guide/#stream-events" },
            {
              text: "Handle Approvals",
              link: "/guide/#handle-approvals-and-server-requests"
            },
            {
              text: "Low-Level APIs",
              link: "/guide/#drop-to-lower-level-apis"
            },
            {
              text: "Bindings And Schemas",
              link: "/guide/#bindings-and-schemas"
            },
            {
              text: "Local Development",
              link: "/guide/#local-development"
            }
          ]
        }
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [{ text: "API Surface", link: "/reference/" }]
        }
      ]
    },
    outline: {
      level: [2, 3],
      label: "On this page"
    },
    search: {
      provider: "local"
    },
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/BrandonMJohnson/codex-client"
      }
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © Brandon Johnson"
    }
  }
});
