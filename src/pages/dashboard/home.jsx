import React, { useEffect, useState } from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Avatar,
  Tooltip,
} from "@material-tailwind/react";
import { GlobeAltIcon, CodeBracketIcon } from "@heroicons/react/24/outline";
import { useMaterialTailwindController } from "@/context";

export function Home() {
  const [controller] = useMaterialTailwindController();
  const { sidenavColor } = controller;

  const [repos, setRepos] = useState({
    Docs: [],
    Tool: [],
    Template: [],
    Lib: [],
    DevContainer: [],
    DaFT: [],
    Uncategorized: [],
  });

  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch repos from GH API
    const fetchRepos = async () => {
      try {
        const response = await fetch(
          "https://api.github.com/users/DiagnosticsMonkey/repos"
        );

        if (!response.ok) {
          if (response.status === 403) {
            // Handle 403 error (rate limit exceeded)
            setError("Rate limit exceeded for GitHub API; please try again later.");
            return; // Stop further execution
          } else {
            setError("Failed to fetch repositories.");
            return; // Stop further execution
          }
        }

        const data = await response.json();

        // Group repos by prefix
        const groupedRepos = data.reduce((acc, repo) => {
          const prefix = repo.name.split("-")[0];
          if (["Docs", "Tool", "Template", "Lib", "DevContainer", "DaFT"].includes(prefix)) {
            if (acc[prefix]) {
              acc[prefix].push(repo);
            } else {
              acc[prefix] = [repo];
            }
          } else {
            if (acc["Uncategorized"]) {
              acc["Uncategorized"].push(repo);
            } else {
              acc["Uncategorized"] = [repo];
            }
          }
          return acc;
        }, { Docs: [], Tool: [], Template: [], Lib: [], DevContainer: [], DaFT: [], Uncategorized: [] });

        setRepos(groupedRepos);
      } catch (error) {
        setError("An error occurred while fetching repositories.");
        console.error(error);
      }
    };

    fetchRepos();
  }, []);

  const renderRepoCard = (repo) => {
    return (
      <Card key={repo.id} className="relative w-full">
        <CardHeader className="relative flex items-center p-2 space-x-2">
          <Avatar 
            src={repo.owner.avatar_url} 
            alt={repo.owner.login} 
            className="h-6 w-6"
          />

          {/* Repo name */}
          <Tooltip content={repo.name}>
            <Typography variant="h6" className="flex-1 text-right truncate">
              {repo.name}
            </Typography>
          </Tooltip>
        </CardHeader>
        <CardBody className="relative flex flex-col justify-between h-full">
          <Typography variant="paragraph">{repo.description || "No description"}</Typography>

          {/* Icons */}
          <div className="absolute bottom-2 right-2 flex items-center">
            {/* GH link */}
            <a
              href={repo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`ml-3 text-${sidenavColor}-500`}
            >
              <CodeBracketIcon className="h-5 w-5 mr-1" />
            </a>
            
            {/* If homepage link, add URL */}
            {repo.homepage && (
              <a
                href={repo.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className={`ml-3 text-${sidenavColor}-500 flex items-center`}
              >
                <GlobeAltIcon className="h-5 w-5 mr-1" />
              </a>
            )}
          </div>
        </CardBody>
      </Card>
    );
  };

  return (
    <div className="mt-12">
      {error ? (
        <Typography variant="h6" className="text-red-500 mb-4">
          {error}
        </Typography>
      ) : (
        ["Docs", "Tool", "Template", "Lib", "DevContainer", "DaFT", "Uncategorized"].map((category) => (
          <div key={category} className="mb-1">
            <Typography variant="h4" className="mb-10">
              {category}
            </Typography>
            <div className="grid gap-y-10 gap-x-6 md:grid-cols-2 xl:grid-cols-4">
              {repos[category].length > 0 ? (
                repos[category].map(renderRepoCard)
              ) : (
                <Typography variant="paragraph" className="text-gray-500">
                  No repositories in this category.
                </Typography>
              )}
            </div>
            <div className="py-6">
              <hr className="border-t-2 border-gray-300" />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default Home;
