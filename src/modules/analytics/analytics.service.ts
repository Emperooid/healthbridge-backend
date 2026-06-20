import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalPatients,
      totalDoctors,
      totalHospitals,
      totalRecords,
      totalAppointments,
      totalLabOrders,
      totalPrescriptions,
      newPatientsThisMonth,
      appointmentsThisMonth,
    ] = await Promise.all([
      this.prisma.patient.count(),
      this.prisma.doctor.count(),
      this.prisma.hospital.count({ where: { isActive: true } }),
      this.prisma.medicalRecord.count(),
      this.prisma.appointment.count(),
      this.prisma.labOrder.count(),
      this.prisma.prescription.count(),
      this.prisma.patient.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.appointment.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    return {
      totalPatients,
      totalDoctors,
      totalHospitals,
      totalAppointments,
      totalRecords,
      totalLabOrders,
      totalPrescriptions,
      newPatientsThisMonth,
      appointmentsThisMonth,
    };
  }

  async getPatientTimeSeries(from?: string, to?: string) {
    return this.buildTimeSeries('patient', from, to);
  }

  async getAppointmentTimeSeries(from?: string, to?: string) {
    return this.buildTimeSeries('appointment', from, to);
  }

  async getRecordTimeSeries(from?: string, to?: string) {
    return this.buildTimeSeries('medicalRecord', from, to);
  }

  async getLabTimeSeries(from?: string, to?: string) {
    return this.buildTimeSeries('labOrder', from, to);
  }

  async getPrescriptionTimeSeries(from?: string, to?: string) {
    return this.buildTimeSeries('prescription', from, to);
  }

  async getHospitalBreakdown() {
    const hospitals = await this.prisma.hospital.findMany({
      where: { isActive: true },
      include: { _count: { select: { patients: true } } },
      orderBy: { name: 'asc' },
    });

    return hospitals.map((h) => ({
      label: h.name,
      value: h._count.patients,
    }));
  }

  private async buildTimeSeries(
    model: 'patient' | 'appointment' | 'medicalRecord' | 'labOrder' | 'prescription',
    from?: string,
    to?: string,
  ) {
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(to) : new Date();

    const records = await (this.prisma[model] as any).findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const counts: Record<string, number> = {};
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(23, 59, 59, 999);

    while (cursor <= endDay) {
      const key = cursor.toISOString().slice(0, 10);
      counts[key] = 0;
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const r of records) {
      const key = (r.createdAt as Date).toISOString().slice(0, 10);
      if (key in counts) counts[key]++;
    }

    return Object.entries(counts).map(([date, count]) => ({ date, count }));
  }
}
