const { STATUS } = require('./remittanceService');

function describeStatus(statusData = {}) {
  switch (statusData.status) {
    case STATUS.NO_RECORD:
      return 'لم نعثر على بيانات تحويل مرتبطة برقمك حالياً. الرجاء تزويدنا بالهوية أو الانتظار حتى يتم التحديث.';
    case STATUS.PENDING:
      return 'التحويل قيد المعالجة حالياً. سنقوم بالتحديث فور الإرسال.';
    case STATUS.SENT_WITH_RECEIPT:
      return `تم إرسال الحوالة${statusData.amount ? ` بمبلغ ${statusData.amount}` : ''}، ولدينا إيصال مرتبط.`;
    case STATUS.SENT_NO_RECEIPT:
      return `تم إرسال الحوالة${statusData.amount ? ` بمبلغ ${statusData.amount}` : ''}، لكن لا يوجد إيصال مرفق حالياً.`;
    default:
      return 'تم استلام سؤالك وسيتم مراجعته.';
  }
}

function generateReply(context = {}) {
  if (context.type === 'GENERAL_SUPPORT') {
    return 'أهلاً بك! كيف يمكنني مساعدتك اليوم؟';
  }

  if (context.type === 'REMITTANCE_STATUS') {
    if (context.statusData?.autoReplyEnabled === false) {
      return 'تم استلام طلبك وسيتولى الفريق الرد عليك يدوياً قريباً.';
    }
    return describeStatus(context.statusData);
  }

  return 'أهلاً بك!';
}

module.exports = { generateReply };
