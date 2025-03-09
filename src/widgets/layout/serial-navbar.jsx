import { useContext, useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  Navbar,
  Typography,
  IconButton,
  Breadcrumbs,
} from "@material-tailwind/react";
import {
  Cog6ToothIcon,
  Bars3Icon,
  SignalSlashIcon,
  SignalIcon,
} from "@heroicons/react/24/solid";
import {
  useMaterialTailwindController,
  setOpenConfigurator,
  setOpenSidenav,
} from "@/context";
import { WebSerialHandler } from "@/context/webserialhandler";

export function SerialNavbar() {
  const [controller, dispatch] = useMaterialTailwindController();
  const { fixedNavbar, openSidenav } = controller;
  const { pathname } = useLocation();
  const [layout, page] = pathname.split("/").filter((el) => el !== "");

  const { isConnected, connect, disconnect } = useContext(WebSerialHandler);
  const [isProcessing, setIsProcessing] = useState(false); // Prevent rapid clicks

  // Log the connection state to debug
  useEffect(() => {
    console.log("Connection status:", isConnected);
  }, [isConnected]);

  const handleConnection = async () => {
    if (isProcessing) return; // Prevent multiple actions

    setIsProcessing(true); // Lock the button during processing

    if (isConnected) {
      await disconnect(); // Disconnect
    } else {
      await connect(); // Connect
    }

    setIsProcessing(false); // Allow further actions
  };

  return (
    <Navbar
      color={fixedNavbar ? "white" : "transparent"}
      className={`rounded-xl transition-all ${
        fixedNavbar
          ? "sticky top-4 z-40 py-3 shadow-md shadow-blue-gray-500/5"
          : "px-0 py-1"
      }`}
      fullWidth
      blurred={fixedNavbar}
    >
      <div className="flex flex-col-reverse justify-between gap-6 md:flex-row md:items-center">
        <div className="capitalize">
          <Breadcrumbs
            className={`bg-transparent p-0 transition-all ${
              fixedNavbar ? "mt-1" : ""
            }`}
          >
            <Link to={`/${layout}`}>
              <Typography
                variant="small"
                color="blue-gray"
                className="font-normal opacity-50 transition-all hover:text-blue-500 hover:opacity-100"
              >
                {layout}
              </Typography>
            </Link>
            <Typography
              variant="small"
              color="blue-gray"
              className="font-normal"
            >
              {page}
            </Typography>
          </Breadcrumbs>
        </div>

        <div className="flex items-center gap-4">
          {/* Connection Status */}
          <Typography variant="small" color="blue-gray">
            {isConnected ? "Connected" : "Disconnected"}
          </Typography>

          {/* Connection Button */}
          <IconButton
            variant="text"
            color={isConnected ? "green" : "red"}
            onClick={handleConnection}
            disabled={isProcessing}
          >
            {isConnected ? (
              <SignalIcon className="h-6 w-6 text-green-500" />
            ) : (
              <SignalSlashIcon className="h-6 w-6 text-red-500" />
            )}
          </IconButton>

          <IconButton
            variant="text"
            color="blue-gray"
            className="grid xl:hidden"
            onClick={() => setOpenSidenav(dispatch, !openSidenav)}
          >
            <Bars3Icon strokeWidth={3} className="h-6 w-6 text-blue-gray-500" />
          </IconButton>

          <IconButton
            variant="text"
            color="blue-gray"
            onClick={() => setOpenConfigurator(dispatch, true)}
          >
            <Cog6ToothIcon className="h-5 w-5 text-blue-gray-500" />
          </IconButton>
        </div>
      </div>
    </Navbar>
  );
}

SerialNavbar.displayName = "/src/widgets/layout/serial-navbar.jsx";

export default SerialNavbar;
