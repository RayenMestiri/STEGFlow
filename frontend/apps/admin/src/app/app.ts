import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService, Login } from 'shared-data-access';

interface NavItem {
  key: string;
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, Login],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly sidebarOpen = signal(false);
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('Opération terminée');

  protected readonly pilotageItems: NavItem[] = [
    { key: 'overview', label: "Vue d'ensemble", icon: 'house', route: '/overview' },
    { key: 'outages', label: 'Coupures', icon: 'zap-off', route: '/outages' },
    { key: 'incidents', label: 'Signalements', icon: 'siren', route: '/incidents' },
    { key: 'teams', label: 'Équipes terrain', icon: 'users', route: '/teams' },
    { key: 'notifications', label: 'Notifications', icon: 'bell', route: '/notifications' },
  ];

  protected readonly administrationItems: NavItem[] = [
    { key: 'audit', label: "Journal d'audit", icon: 'history', route: '/audit' },
    { key: 'settings', label: 'Paramètres', icon: 'settings', route: '/settings' },
  ];

  ngOnInit(): void {
    this.auth.initialize().subscribe();
  }

  protected handleSignedIn(): void {
    this.auth.requireRole(['admin', 'supervisor', 'dispatcher']).subscribe();
  }

  protected logout(): void {
    this.auth.logout().subscribe();
  }
}
