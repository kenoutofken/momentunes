import { Heart, Map as MapIcon, ContactRound, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

type MainBottomNavProps = {
  active: "map" | "memories" | "friends" | "account";
  friendRequestCount: number;
  className?: string;
};

// Shared by every page that shows the primary Map/Memories/Friends/Account tab
// bar, so its look (radius, glass effect, etc.) only needs to change in one place.
const MainBottomNav = ({ active, friendRequestCount, className }: MainBottomNavProps) => {
  const navigate = useNavigate();

  return (
    <nav className={className ? `app-bottom-nav ${className}` : "app-bottom-nav"} aria-label="Primary navigation">
      <button className={active === "map" ? "active" : ""} onClick={() => active !== "map" && navigate("/")}><MapIcon /><span>Map</span></button>
      <button className={active === "memories" ? "active" : ""} onClick={() => active !== "memories" && navigate("/journal")}><Heart /><span>Memories</span></button>
      <button className={active === "friends" ? "active" : ""} data-tour="friends" onClick={() => active !== "friends" && navigate("/friends")}>
        <span className="nav-icon-wrap"><ContactRound />{friendRequestCount > 0 && <span className="nav-request-badge">{friendRequestCount > 9 ? "9+" : friendRequestCount}</span>}</span>
        <span>Friends</span>
      </button>
      <button className={active === "account" ? "active" : ""} data-tour="account" onClick={() => active !== "account" && navigate("/account")}><UserRound /><span>Account</span></button>
    </nav>
  );
};

export default MainBottomNav;
