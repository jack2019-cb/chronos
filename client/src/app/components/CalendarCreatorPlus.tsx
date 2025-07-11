import React from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import CalendarArea from "./CalendarArea";
import styles from "./CalendarCreatorPlus.module.css";

const CalendarCreatorPlus: React.FC = () => {
  return (
    <div className={styles["calendar-plus-root"]}>
      <TopBar />
      <div className={styles["calendar-plus-main"]}>
        <Sidebar />
        <CalendarArea />
      </div>
    </div>
  );
};

export default CalendarCreatorPlus;
