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
    payment: t('or2_payment'), cod: t('or2_cod'), deposit: t('or2_deposit'),
    transfer: t('or2_transfer'), advance: t('or2_advance'),
    codDue: t('or2_cod_due'), fixFirst: t('or2_fix_first'),
    channel: t('or2_channel'), pickChannel: t('or2_pick_channel'),
    payRef: t('or2_pay_ref'), payRefPh: t('or2_pay_ref_ph'),
    slip: t('or2_slip'), slipAdd: t('or2_slip_add'), slipView: t('or2_slip_view'),
    slipRemove: t('or2_slip_remove'), uploading: t('or2_uploading'),
    deliveryMethod: t('or2_delivery_method'), deliveryPh: t('or2_delivery_ph'),
    orderDate: t('or2_order_date'), status: t('or2_status'), note: t('or2_note'),
    notePh: t('or2_note_ph'), save: t('or2_save'), saving: t('or2_saving'),
    failed: t('or2_failed'),
    errors: {
      required: t('ove_required'), bad_phone: t('ove_bad_phone'),
      no_lines: t('ove_no_lines'), bad_qty: t('ove_bad_qty'),
      bad_price: t('ove_bad_price'), zero_total: t('ove_zero_total'),
      negative: t('ove_negative'), over_subtotal: t('ove_over_subtotal'),
      over_total: t('ove_over_total'), cod_no_advance: t('ove_cod_no_advance'),
      transfer_full: t('ove_transfer_full'), deposit_required: t('ove_deposit_required'),
      future: t('ove_future'), channel_required: t('ove_channel_required'),
    },
    statuses: {
      pending: t('os_pending'), confirmed: t('os_confirmed'), packed: t('os_packed'),
      shipped: t('os_shipped'), delivered: t('os_delivered'), cancelled: t('os_cancelled'),
    },
  };
}
