# CMSC 127 Project: Cozy Cafe Admin

## Project Overview

The Cozy Cafe Client System is a Point of Sale (POS) and Inventory Management platform designed to streamline cafe operations, provide real-time sales tracking, and manage stock levels.

## How The Website Works

The website has two main sides: the customer-facing menu and the admin dashboard. Customers can browse the public menu by category, choose a menu item, view available sizes, and see item photos when a photo URL has been added in the menu item record.

Admins use the dashboard to create orders, monitor the queue, manage inventory, update menu items, and track revenue. New orders are created from the Queue page using the same category flow as the customer menu: choose a parent category, choose a subcategory, choose an item, then choose a size. Confirmed orders appear in the pending queue with a waiting-time badge.

Inventory is separated from menu items. Menu items are sellable products like drinks, rice bowls, pasta, or fries. Inventory ingredients are raw materials like milk, coffee beans, syrups, chicken wings, flour, or Coke bottles. Each menu item must be linked to at least one recipe ingredient before it can be ordered, so stock can be deducted correctly.

The Inventory page supports adding ingredients, classifying ingredients, stock in/out adjustments, cost tracking, menu item editing, recipe ingredient linking, and archived item management. Revenue uses order totals and expenses to show sales, costs, and net income.

Menu item photos are handled through Supabase Storage or another image host. The actual photo is uploaded to storage, then its public photo URL is saved in the menu item's Photo URL field.

## Prerequisites

Before running this project, ensure you have the following installed:

Node.js: Version 18.0 or higher.

npm or yarn: Package managers for installing dependencies.

Git: For version control and repository management.

Browser: A modern web browser such as Chrome, Firefox, or Edge for development.

## Functional Requirements

1. Data Management

Order Tracking: Maintains records including timestamps, handling cashiers, and status.

Menu Management: Stores menu prices, categories, sizes, availability, and customer-facing photo URLs.

Inventory Control: Tracks ingredient quantities, unit measures, classifications, and recipe links to menu items.

2. Transactional Inputs

Order Processing: Supports category-based menu selection, size selection, quantity adjustment, and subtotal calculation.

Payment Handling: Supports order totals and received-order revenue tracking.

Stock Adjustments: Supports Stock In and Stock Out actions, including optional peso cost tracking for Stock In.

3. Reporting & Alerts

Stock Alerts: Highlights low-stock and negative-stock ingredients.

Kitchen Queue: Shows pending orders with waiting-time badges.

Financial Auditing: Tracks revenue from orders, expenses from costs, and net income.

## Local Setup

Clone the repository and follow the full setup, Supabase schema, Google login, and admin instructions in `test-app/README.md`.

Navigate to the project folder:

```bash
cd test-app
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The app expects Supabase environment variables in the repo-root `.env` file because `test-app/vite.config.js` sets `envDir` to the parent directory.
