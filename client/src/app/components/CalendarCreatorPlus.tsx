import React from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import CalendarArea from "./CalendarArea";
import styles from "./CalendarCreatorPlus.module.css";
import { CalendarViewProvider } from "./CalendarViewContext";

const CalendarCreatorPlus: React.FC = () => {
  return (
    <CalendarViewProvider>
      <div className={styles["calendar-plus-root"]}>
        <TopBar />
        <div className={styles["calendar-plus-main"]}>
          <Sidebar />
          <CalendarArea />
        </div>
      </div>
    </CalendarViewProvider>
  );
};

export default CalendarCreatorPlus;
