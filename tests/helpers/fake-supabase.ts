import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerRow } from "@/lib/logic/update-customer";

/** orders_processed テーブルの行 */
export interface OrderProcessedRow {
  shopify_order_id: number;
  shopify_customer_id: number;
  bread_count_added: number;
  processed_at: string;
}

/** sku_bread_map テーブルの行 */
export interface SkuBreadMapRow {
  sku: string;
  bread_count: number;
  product_name: string | null;
  updated_at: string;
}

interface QueryResult<T> {
  data: T;
  error: { code?: string; message: string } | null;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * processPaidOrder が使用するクエリチェーンだけを実装した
 * インメモリの Supabase フェイククライアント。
 * PRIMARY KEY / UNIQUE 制約による冪等性の挙動（23505）も再現する。
 */
export class FakeSupabase {
  customers = new Map<number, CustomerRow>();
  ordersProcessed = new Map<number, OrderProcessedRow>();
  skuBreadMap = new Map<string, SkuBreadMapRow>();
  private nextCustomerRowId = 1;

  seedSku(sku: string, breadCount: number, productName?: string): void {
    this.skuBreadMap.set(sku, {
      sku,
      bread_count: breadCount,
      product_name: productName ?? null,
      updated_at: now(),
    });
  }

  seedCustomer(
    partial: Pick<CustomerRow, "shopify_customer_id"> & Partial<CustomerRow>,
  ): CustomerRow {
    const row: CustomerRow = {
      id: this.nextCustomerRowId++,
      line_user_id: null,
      email: null,
      total_bread_count: 0,
      last_milestone_reached: 0,
      linked_at: null,
      created_at: now(),
      updated_at: now(),
      ...partial,
    };
    this.customers.set(row.shopify_customer_id, row);
    return row;
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }

  from(table: string) {
    switch (table) {
      case "orders_processed":
        return this.ordersProcessedTable();
      case "sku_bread_map":
        return this.skuBreadMapTable();
      case "customers":
        return this.customersTable();
      default:
        throw new Error(`FakeSupabase: 未対応のテーブル: ${table}`);
    }
  }

  private ordersProcessedTable() {
    return {
      select: () => ({
        eq: (_column: string, value: number) => ({
          maybeSingle: async (): Promise<QueryResult<OrderProcessedRow | null>> => ({
            data: this.ordersProcessed.get(value) ?? null,
            error: null,
          }),
        }),
      }),
      insert: async (
        row: Omit<OrderProcessedRow, "processed_at">,
      ): Promise<QueryResult<null>> => {
        // PRIMARY KEY 制約を再現: 重複挿入は 23505 を返す
        if (this.ordersProcessed.has(row.shopify_order_id)) {
          return {
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          };
        }
        this.ordersProcessed.set(row.shopify_order_id, { ...row, processed_at: now() });
        return { data: null, error: null };
      },
      delete: () => ({
        eq: async (_column: string, value: number): Promise<QueryResult<null>> => {
          this.ordersProcessed.delete(value);
          return { data: null, error: null };
        },
      }),
    };
  }

  private skuBreadMapTable() {
    return {
      select: () => ({
        in: async (
          _column: string,
          values: string[],
        ): Promise<QueryResult<Pick<SkuBreadMapRow, "sku" | "bread_count">[]>> => ({
          data: values
            .filter((sku) => this.skuBreadMap.has(sku))
            .map((sku) => {
              const row = this.skuBreadMap.get(sku)!;
              return { sku: row.sku, bread_count: row.bread_count };
            }),
          error: null,
        }),
      }),
    };
  }

  private customersTable() {
    return {
      select: () => ({
        eq: (_column: string, value: number) => ({
          maybeSingle: async (): Promise<QueryResult<CustomerRow | null>> => ({
            data: this.customers.get(value) ?? null,
            error: null,
          }),
        }),
      }),
      upsert: async (
        row: Pick<
          CustomerRow,
          | "shopify_customer_id"
          | "email"
          | "total_bread_count"
          | "last_milestone_reached"
          | "updated_at"
        >,
      ): Promise<QueryResult<null>> => {
        const existing = this.customers.get(row.shopify_customer_id);
        if (existing) {
          this.customers.set(row.shopify_customer_id, { ...existing, ...row });
        } else {
          this.customers.set(row.shopify_customer_id, {
            id: this.nextCustomerRowId++,
            line_user_id: null,
            linked_at: null,
            created_at: now(),
            ...row,
          });
        }
        return { data: null, error: null };
      },
    };
  }
}
