import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const tradesTable = pgTable("trading_trades", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  status: text("status").notNull(),
  entry: real("entry").notNull(),
  exit: real("exit"),
  stopLoss: real("stop_loss").notNull(),
  target: real("target").notNull(),
  pnl: real("pnl"),
  riskReward: real("risk_reward").notNull(),
  session: text("session").notNull(),
  setup: text("setup").notNull(),
  confluences: text("confluences").array().notNull().default([]),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  audit: jsonb("audit").notNull(),
});

export const alertsTable = pgTable("trading_alerts", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const botSettingsTable = pgTable("trading_bot_settings", {
  id: serial("id").primaryKey(),
  mode: text("mode").notNull().default("paper"),
  running: boolean("running").notNull().default(false),
  liveOrdersEnabled: boolean("live_orders_enabled").notNull().default(false),
  symbol: text("symbol").notNull().default("BTC/USDT"),
  maxTradesPerDay: integer("max_trades_per_day").notNull().default(1),
  riskPerTrade: real("risk_per_trade").notNull().default(0.5),
  sessions: text("sessions").array().notNull().default(["london", "new_york"]),
  telegramStatus: text("telegram_status").notNull().default("not_configured"),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({
  id: true,
  openedAt: true,
  closedAt: true,
});
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
export type Alert = typeof alertsTable.$inferSelect;
export type BotSettings = typeof botSettingsTable.$inferSelect;