import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AppointmentStatus, LabOrderStatus, PrescriptionStatus, RecordStatus } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview() {
    const [
      totalPatients,
      totalDoctors,
      totalHospitals,
      totalRecords,
      totalAppointments,
      totalLabOrders,
      totalPrescriptions,
      totalVisits,
    ] = await Promise.all([
      this.prisma.patient.count(),
      this.prisma.doctor.count(),
      this.prisma.hospital.count({ where: { isActive: true } }),
      this.prisma.medicalRecord.count(),
      this.prisma.appointment.count(),
      this.prisma.labOrder.count(),
      this.prisma.prescription.count(),
      this.prisma.visit.count(),
    ]);

    return {
      totalPatients,
      totalDoctors,
      totalHospitals,
      totalRecords,
      totalAppointments,
      totalLabOrders,
      totalPrescriptions,
      totalVisits,
    };
  }

  async getPatientStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [total, newThisMonth, newLastMonth, byGender, byBloodType] = await Promise.all([
      this.prisma.patient.count(),
      this.prisma.patient.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.patient.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
      this.prisma.patient.groupBy({ by: ['gender'], _count: { id: true } }),
      this.prisma.patient.groupBy({ by: ['bloodType'], _count: { id: true } }),
    ]);

    return {
      total,
      newThisMonth,
      newLastMonth,
      growthRate: newLastMonth > 0 ? (((newThisMonth - newLastMonth) / newLastMonth) * 100).toFixed(1) + '%' : 'N/A',
      byGender: byGender.map((g) => ({ gender: g.gender ?? 'Unknown', count: g._count.id })),
      byBloodType: byBloodType.map((b) => ({ bloodType: b.bloodType ?? 'Unknown', count: b._count.id })),
    };
  }

  async getAppointmentStats() {
    const [total, byStatus, upcoming] = await Promise.all([
      this.prisma.appointment.count(),
      this.prisma.appointment.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.appointment.count({
        where: {
          scheduledAt: { gte: new Date() },
          status: { notIn: [AppointmentStatus.CANCELLED] },
        },
      }),
    ]);

    return {
      total,
      upcoming,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
    };
  }

  async getRecordStats() {
    const [total, byStatus, recentRecords] = await Promise.all([
      this.prisma.medicalRecord.count(),
      this.prisma.medicalRecord.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.medicalRecord.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    return {
      total,
      createdThisMonth: recentRecords,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
    };
  }

  async getHospitalStats() {
    const hospitals = await this.prisma.hospital.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: {
            patients: true,
            doctors: true,
            appointments: true,
            records: true,
            departments: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return hospitals.map((h) => ({
      id: h.id,
      name: h.name,
      patients: h._count.patients,
      doctors: h._count.doctors,
      appointments: h._count.appointments,
      records: h._count.records,
      departments: h._count.departments,
    }));
  }

  async getLabStats() {
    const [total, byStatus, abnormalResults] = await Promise.all([
      this.prisma.labOrder.count(),
      this.prisma.labOrder.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.labResult.count({ where: { isAbnormal: true } }),
    ]);

    return {
      totalOrders: total,
      abnormalResults,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
    };
  }

  async getPrescriptionStats() {
    const [total, byStatus, recentCount] = await Promise.all([
      this.prisma.prescription.count(),
      this.prisma.prescription.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.prescription.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    return {
      total,
      issuedThisMonth: recentCount,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
    };
  }
}
