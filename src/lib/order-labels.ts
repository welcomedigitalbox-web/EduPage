import type { OrderFormLabels } from '@/components/OrderForm';

/** One place to build the form's labels, so the new-order and edit pages can
 *  never drift apart. */
export function orderFormLabels(
  t: (k: string, v?: Record<string, string | number>) => string
): OrderFormLabels {
  return {
    customer: t('or2_customer'), name: t('or2_name'), phone: t('or2_phone'),
    city: t('or2_city'), address: t('or2_address'), shop: t('or2_shop'),
    pickShop: t('or2_pick_shop'), items: t('or2_items'), barcode: t('or2_barcode'),
    description: t('or2_desc'), unitPrice: t('or2_unit_price'), qty: t('or2_qty'),
    lineTotal: t('or2_line_total'), addLine: t('or2_add_line'), removeLine: t('or2_remove_line'),
    money: t('or2_money'), subtotal: t('or2_subtotal'), discount: t('or2_discount'),
    deliveryFee: t('or2_delivery_fee'), grandTotal: t('or2_grand_total'),
    payment: t('or2_payment'), cod: t('or2_cod'), transfer: t('or2_transfer'),
    prepaid: t('or2_prepaid'), advance: t('or2_advance'),
    deliveryMethod: t('or2_delivery_method'), deliveryPh: t('or2_delivery_ph'),
    orderDate: t('or2_order_date'), status: t('or2_status'), note: t('or2_note'),
    notePh: t('or2_note_ph'), save: t('or2_save'), saving: t('or2_saving'),
    failed: t('or2_failed'), nameRequired: t('or2_name_required'),
    statuses: {
      pending: t('os_pending'), confirmed: t('os_confirmed'), packed: t('os_packed'),
      shipped: t('os_shipped'), delivered: t('os_delivered'), cancelled: t('os_cancelled'),
    },
  };
}
