import React, { useContext } from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Button,
} from "@material-tailwind/react";
import { WebSerialHandler } from "@/context/webserialhandler";

export function Console() {
  const { connect, disconnect, logs } = useContext(WebSerialHandler);

  return (
    <div className="mx-auto my-20 flex max-w-screen-lg flex-col gap-8">
    <Card>
      <CardHeader
        color="transparent"
        floated={false}
        shadow={false}
        className="m-0 p-4 flex justify-between items-center"
      >
        <Typography variant="h5" color="blue-gray">
          Serial Console
        </Typography>
        <div className="flex gap-2">
          <Button color="green">
            1
          </Button>
          <Button color="red">
            2
          </Button>
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-4 p-4 bg-black text-green-400 h-80 overflow-y-auto font-mono">
        {logs.length > 0 ? (
          logs.map((log, index) => (
            <Typography key={index} variant="small">
              {log}
            </Typography>
          ))
        ) : (
          <Typography variant="small" className="text-gray-500">
            No data received...
          </Typography>
        )}
      </CardBody>
    </Card>
    </div>
  );
}

export default Console;
