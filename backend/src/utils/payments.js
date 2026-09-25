function getOfferValue(offer) {
  return Number(offer?.value || 0);
}

function getSessionCosts(student, attendances) {
  const sorted = [...attendances].sort((a, b) => new Date(a.session?.date || 0) - new Date(b.session?.date || 0));
  let remainingFreeSessions = student.offer?.type === 'sessions' ? getOfferValue(student.offer) : 0;
  const costs = new Map();

  for (const attendance of sorted) {
    let price = Number(attendance.session?.price || 0);

    if (student.offer) {
      if (student.offer.type === 'percentage') {
        price -= price * (getOfferValue(student.offer) / 100);
      } else if (student.offer.type === 'amount') {
        price -= getOfferValue(student.offer);
        price = Math.max(0, price);
      } else if (student.offer.type === 'sessions' && remainingFreeSessions > 0) {
        price = 0;
        remainingFreeSessions -= 1;
      }
    }

    costs.set(attendance.id, Math.max(0, Math.round(price * 100) / 100));
  }

  return costs;
}

function getBookCost(booking) {
  let price = Number(booking.book?.price || 0) * Number(booking.quantity || 1);
  const discountValue = Number(booking.discountValue || 0);

  if (booking.discountType === 'percentage') {
    price -= price * (discountValue / 100);
  } else if (booking.discountType === 'amount') {
    price -= discountValue;
  }

  return Math.max(0, Math.round(price * 100) / 100);
}

function summarizeStudentPayments(student) {
  const attendances = (student.attendance || []).filter(a => a.isAttendant);
  const sessionCosts = getSessionCosts(student, attendances);

  let sessionsDue = 0;
  let sessionsPaid = 0;
  for (const attendance of attendances) {
    sessionsDue += sessionCosts.get(attendance.id) || 0;
    sessionsPaid += Number(attendance.amountPaid || 0);
  }

  let bookingsDue = 0;
  let bookingsPaid = 0;
  for (const booking of student.bookBookings || []) {
    bookingsDue += getBookCost(booking);
    bookingsPaid += Number(booking.amountPaid || 0);
  }

  const eachPayments = student.eachPayments || [];
  const amountPaid = eachPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  // فصل إجمالي المدفوع فعليًا حسب نوع الدفعة (حصص / كتب)
  const sessionsAmountPaid = eachPayments
    .filter(p => p.type === 'sessions')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const bookingsAmountPaid = eachPayments
    .filter(p => p.type === 'book')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // الرصيد الفايض (لو الطالب دفع حصص/كتب أكتر من المستحق فعليًا) لكل نوع لوحده
  const sessionsBalance = Math.round((sessionsAmountPaid - sessionsPaid) * 100) / 100;
  const bookingsBalance = Math.round((bookingsAmountPaid - bookingsPaid) * 100) / 100;

  return {
    sessionsDue: Math.round(sessionsDue * 100) / 100,
    sessionsPaid: Math.round(sessionsPaid * 100) / 100,
    bookingsDue: Math.round(bookingsDue * 100) / 100,
    bookingsPaid: Math.round(bookingsPaid * 100) / 100,
    amountDue: Math.round((sessionsDue + bookingsDue) * 100) / 100,
    amountPaid: Math.round(amountPaid * 100) / 100,
    sessionsAmountPaid: Math.round(sessionsAmountPaid * 100) / 100,
    bookingsAmountPaid: Math.round(bookingsAmountPaid * 100) / 100,
    sessionsBalance,  // موجب = رصيد فايض في الحصص لسه محجزش عليه
    bookingsBalance,  // موجب = رصيد فايض في الكتب لسه محجزش عليه
    sessionCosts
  };
}

async function getStudentPaymentSnapshot(prisma, studentId) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      group: true,
      offer: true,
      attendance: { include: { session: { include: { group: true } } } },
      bookBookings: { include: { book: true } },
      eachPayments: { orderBy: { lastPaymentDate: 'desc' } }
    }
  });

  if (!student) return null;
  return { student, payment: summarizeStudentPayments(student) };
}

module.exports = { getBookCost, getSessionCosts, getStudentPaymentSnapshot, summarizeStudentPayments };
